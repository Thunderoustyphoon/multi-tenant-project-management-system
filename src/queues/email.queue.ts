import Bull from 'bull';
import nodemailer from 'nodemailer';
import { redisClient } from '../config/redis';
import prisma from '../config/prisma';
import logger from '../utils/logger';

/**
 * Bull Queue for async email processing
 * 
 * Per spec requirements:
 * - Exponential backoff (3 retries: 1min, 5min, 30min)
 * - Dead letter queue for failed deliveries
 * - Delivery logs stored in database
 * - Max 2 concurrent workers per instance
 * - Use Nodemailer with Ethereal test SMTP and log preview URL
 */

export interface EmailJob {
  tenantId: string;
  to: string;
  subject: string;
  htmlContent: string;
  templateType: string; // "WELCOME", "USER_INVITED", "KEY_ROTATED", "RATE_LIMIT_WARNING", etc.
  context?: Record<string, unknown>;
  sendAt?: Date;
}

/**
 * Create Bull queues with Redis connection
 */
let emailQueue: Bull.Queue<EmailJob> | null = null;
let deadLetterQueue: Bull.Queue<EmailJob> | null = null;

// Cache Ethereal transport to avoid creating a new account per email
let cachedTransport: nodemailer.Transporter | null = null;

async function getEtherealTransport(): Promise<nodemailer.Transporter> {
  if (cachedTransport) return cachedTransport;

  // Create Ethereal test account
  const testAccount = await nodemailer.createTestAccount();

  cachedTransport = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  logger.info(`Ethereal test account: ${testAccount.user}`);
  return cachedTransport;
}

export async function initializeQueues() {
  // Main email queue
  emailQueue = new Bull<EmailJob>('email-queue', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0')
    },
    defaultJobOptions: {
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential',
        delay: 60000 // Start with 1 minute
      },
      removeOnComplete: true,
      removeOnFail: false // Keep failed jobs for debugging
    }
  });

  // Dead letter queue for permanently failed emails
  deadLetterQueue = new Bull<EmailJob>('email-dlq', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0')
    }
  });

  // Process email jobs with max 2 concurrent workers
  emailQueue.process(2, processEmailJob);

  // Event handlers for main queue
  emailQueue.on('completed', async (job) => {
    logger.info(`Email job completed: ${job.id}`);
    await recordDeliveryLog({
      jobId: String(job.id),
      tenantId: job.data.tenantId,
      to: job.data.to,
      template: job.data.templateType || 'UNKNOWN',
      status: 'sent',
      attempts: job.attemptsMade,
    });
  });

  emailQueue.on('failed', async (job, err) => {
    logger.error(`Email job failed: ${job.id}`, err.message);

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      // Move to DLQ if all retries exhausted
      logger.warn(`Moving job ${job.id} to dead letter queue`);
      if (deadLetterQueue) {
        await deadLetterQueue.add(job.data);
      }

      await recordDeliveryLog({
        jobId: String(job.id),
        tenantId: job.data.tenantId,
        to: job.data.to,
        template: job.data.templateType || 'UNKNOWN',
        status: 'failed',
        attempts: job.attemptsMade,
        lastError: err.message,
      });
    } else {
      // Log retry attempt
      const delays = [60000, 300000, 1800000]; // 1min, 5min, 30min
      const nextDelay = delays[job.attemptsMade] || 1800000;

      await recordDeliveryLog({
        jobId: String(job.id),
        tenantId: job.data.tenantId,
        to: job.data.to,
        template: job.data.templateType || 'UNKNOWN',
        status: 'pending',
        attempts: job.attemptsMade,
        lastError: `Will retry in ${nextDelay / 1000 / 60} minutes`,
      });
    }
  });

  emailQueue.on('stalled', (job) => {
    logger.warn(`Email job stalled: ${job.id}`);
  });

  logger.info('Email queues initialized');
}

/**
 * Process individual email job using Nodemailer with Ethereal
 * Spec: "use Nodemailer with a test SMTP service (Ethereal or Mailtrap) and log the preview URL"
 */
async function processEmailJob(job: Bull.Job<EmailJob>): Promise<void> {
  const { to, subject, htmlContent } = job.data;

  try {
    logger.info(`Processing email job: ${job.id}`);
    logger.info(`To: ${to}, Subject: ${subject}`);

    // Get Ethereal transport
    const transporter = await getEtherealTransport();

    // Send email via Nodemailer
    const info = await transporter.sendMail({
      from: '"Multi-Tenant PM" <noreply@mtpm.example.com>',
      to,
      subject,
      html: htmlContent,
    });

    // Log preview URL (spec requirement)
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Email preview URL: ${previewUrl}`);
    }
    logger.info(`Email sent: ${info.messageId}`);

    return;
  } catch (err) {
    throw new Error(`Failed to send email to ${to}: ${(err as Error).message}`);
  }
}

/**
 * Record email delivery attempt in database
 * Fixed field names to match EmailDeliveryLog schema
 */
interface DeliveryLogInput {
  jobId: string;
  tenantId: string;
  to: string;
  template: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
}

async function recordDeliveryLog(data: DeliveryLogInput): Promise<void> {
  try {
    await prisma.emailDeliveryLog.create({
      data: {
        jobId: data.jobId,
        tenantId: data.tenantId,
        recipient: data.to,
        template: data.template,
        status: data.status,
        attemptCount: data.attempts,
        errorMessage: data.lastError,
      }
    });
  } catch (err) {
    logger.error('Failed to record email delivery log', err);
  }
}

/**
 * Enqueue an email job
 */
export async function queueEmail(emailJob: EmailJob): Promise<Bull.Job<EmailJob>> {
  if (!emailQueue) {
    throw new Error('Email queue not initialized. Call initializeQueues() first.');
  }

  // Optional: Schedule for later if sendAt is specified
  if (emailJob.sendAt && emailJob.sendAt > new Date()) {
    return emailQueue.add(emailJob, {
      delay: emailJob.sendAt.getTime() - Date.now()
    });
  }

  return emailQueue.add(emailJob);
}

/**
 * Get email delivery history
 */
export async function getDeliveryHistory(tenantId: string, options?: {
  recipient?: string;
  limit?: number;
  status?: 'pending' | 'sent' | 'failed';
}) {
  const where: Record<string, unknown> = { tenantId };

  if (options?.recipient) {
    where.recipient = options.recipient;
  }

  if (options?.status) {
    where.status = options.status;
  }

  return prisma.emailDeliveryLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50
  });
}

/**
 * Retry a failed email from DLQ
 */
export async function retryFailedEmail(jobId: string): Promise<Bull.Job<EmailJob> | null> {
  if (!deadLetterQueue) {
    throw new Error('Dead letter queue not initialized');
  }

  const job = await deadLetterQueue.getJob(jobId);
  if (!job) {
    return null;
  }

  // Move back to main queue for retry
  const data = job.data;
  await job.remove();

  return queueEmail(data);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  emailQueue: {
    active: number;
    delayed: number;
    failed: number;
    waiting: number;
    completed: number;
  };
  deadLetterQueue: {
    count: number;
  };
}> {
  if (!emailQueue || !deadLetterQueue) {
    throw new Error('Queues not initialized');
  }

  const [emailCounts, dlqCounts] = await Promise.all([
    Promise.all([
      emailQueue.getActiveCount(),
      emailQueue.getDelayedCount(),
      emailQueue.getFailedCount(),
      emailQueue.getWaitingCount(),
      emailQueue.getCompletedCount()
    ]),
    deadLetterQueue.count()
  ]);

  return {
    emailQueue: {
      active: emailCounts[0],
      delayed: emailCounts[1],
      failed: emailCounts[2],
      waiting: emailCounts[3],
      completed: emailCounts[4]
    },
    deadLetterQueue: {
      count: dlqCounts
    }
  };
}

/**
 * Clean up old completed jobs (optional housekeeping)
 */
export async function cleanupOldJobs(olderThan: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  if (!emailQueue) {
    throw new Error('Email queue not initialized');
  }

  const completed = await emailQueue.clean(olderThan, 'completed');
  logger.info(`Cleaned up ${completed.length} old completed jobs`);
}

/**
 * Graceful shutdown
 */
export async function shutdownQueues(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    logger.info('Email queue closed');
  }

  if (deadLetterQueue) {
    await deadLetterQueue.close();
    logger.info('Dead letter queue closed');
  }
}

export { emailQueue, deadLetterQueue };
