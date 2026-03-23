import { queueEmail, getDeliveryHistory, EmailJob } from '../queues/email.queue';
import { EMAIL_TEMPLATES } from './email.templates';

/**
 * Email Service
 * High-level interface for sending emails asynchronously via Bull queue
 * Uses structured templates from email.templates.ts
 */
export class EmailService {
  /**
   * Send a welcome email to new tenant owner
   * Used in: POST /api/auth/register
   */
  static async sendWelcomeEmail(
    tenantId: string,
    ownerEmail: string,
    ownerName: string,
    tenantName: string
  ): Promise<string> {
    const template = EMAIL_TEMPLATES.WELCOME;
    const subject = typeof template.subject === 'function'
      ? template.subject(tenantName)
      : template.subject;

    const job = await queueEmail({
      tenantId,
      to: ownerEmail,
      subject,
      htmlContent: template.body(ownerName, tenantName),
      templateType: 'WELCOME',
      context: { ownerName, tenantName }
    });

    return String(job.id);
  }

  /**
   * Send invite email when user is added to a workspace
   * Spec: "New user invited to tenant" — one of three required email triggers
   */
  static async sendInviteEmail(
    tenantId: string,
    userEmail: string,
    userName: string,
    workspaceName: string
  ): Promise<string> {
    const template = EMAIL_TEMPLATES.USER_INVITED;
    const subject = typeof template.subject === 'function'
      ? template.subject(workspaceName)
      : template.subject;

    const job = await queueEmail({
      tenantId,
      to: userEmail,
      subject,
      htmlContent: template.body(userName, workspaceName),
      templateType: 'USER_INVITED',
      context: { userName, workspaceName }
    });

    return String(job.id);
  }

  /**
   * Send API key rotation notification
   * Used in: POST /api/auth/api-keys/:keyId/rotate
   */
  static async sendApiKeyRotatedEmail(
    tenantId: string,
    ownerEmail: string,
    ownerName: string,
    keyName: string,
    gracePeriodUntil: Date
  ): Promise<string> {
    const gracePeriodMinutes = Math.round((gracePeriodUntil.getTime() - Date.now()) / 60000);
    const template = EMAIL_TEMPLATES.KEY_ROTATED;
    const subject = typeof template.subject === 'function'
      ? template.subject(keyName)
      : template.subject;

    const job = await queueEmail({
      tenantId,
      to: ownerEmail,
      subject,
      htmlContent: template.body(ownerName, keyName, gracePeriodMinutes),
      templateType: 'KEY_ROTATED',
      context: { keyName, gracePeriodUntil }
    });

    return String(job.id);
  }

  /**
   * Send rate limit warning email
   * Spec: "rate limit threshold warning (at 80% of global limit)"
   */
  static async sendRateLimitWarningEmail(
    tenantId: string,
    adminEmail: string,
    currentCount: number,
    limit: number
  ): Promise<string> {
    const percentage = Math.round((currentCount / limit) * 100);
    const template = EMAIL_TEMPLATES.RATE_LIMIT_WARNING;
    const subject = typeof template.subject === 'function'
      ? (template.subject as () => string)()
      : template.subject;

    const job = await queueEmail({
      tenantId,
      to: adminEmail,
      subject,
      htmlContent: template.body(currentCount, limit, percentage),
      templateType: 'RATE_LIMIT_WARNING',
      context: { currentCount, limit, percentage }
    });

    return String(job.id);
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(
    tenantId: string,
    userEmail: string,
    userName: string,
    resetLink: string,
    expiresIn: number = 3600000 // 1 hour default
  ): Promise<string> {
    const expiresInMinutes = Math.round(expiresIn / 60000);
    const template = EMAIL_TEMPLATES.PASSWORD_RESET;
    const subject = typeof template.subject === 'function'
      ? (template.subject as () => string)()
      : template.subject;

    const job = await queueEmail({
      tenantId,
      to: userEmail,
      subject,
      htmlContent: template.body(userName, resetLink, expiresInMinutes),
      templateType: 'PASSWORD_RESET',
      context: { resetLink, expiresIn }
    });

    return String(job.id);
  }

  /**
   * Send monthly audit summary email
   */
  static async sendAuditSummaryEmail(
    tenantId: string,
    ownerEmail: string,
    ownerName: string,
    summary: {
      totalEvents: number;
      apiKeysRotated: number;
      usersAdded: number;
      projectsCreated: number;
      failedAuthAttempts: number;
      suspiciousActivities: number;
    }
  ): Promise<string> {
    const template = EMAIL_TEMPLATES.AUDIT_SUMMARY;
    const subject = typeof template.subject === 'function'
      ? (template.subject as () => string)()
      : template.subject;

    const job = await queueEmail({
      tenantId,
      to: ownerEmail,
      subject,
      htmlContent: template.body(ownerName, summary),
      templateType: 'AUDIT_SUMMARY',
      context: summary
    });

    return String(job.id);
  }

  /**
   * Send bulk/batch email (used for notifications to multiple recipients)
   */
  static async sendBulkEmail(
    tenantId: string,
    recipients: Array<{ email: string; name: string }>,
    subject: string,
    htmlContent: string
  ): Promise<string[]> {
    const jobIds: string[] = [];

    for (const recipient of recipients) {
      const personalizedContent = htmlContent.replace(/\${name}/g, recipient.name);

      const job = await queueEmail({
        tenantId,
        to: recipient.email,
        subject,
        htmlContent: personalizedContent,
        templateType: 'BULK',
      });

      jobIds.push(String(job.id!));
    }

    return jobIds;
  }

  /**
   * Schedule email for later delivery
   */
  static async scheduleEmail(
    tenantId: string,
    to: string,
    subject: string,
    htmlContent: string,
    sendAt: Date
  ): Promise<string> {
    const job = await queueEmail({
      tenantId,
      to,
      subject,
      htmlContent,
      templateType: 'SCHEDULED',
      sendAt
    });

    return String(job.id!);
  }

  /**
   * Get delivery history for a tenant
   */
  static async getDeliveryHistory(
    tenantId: string,
    options?: {
      recipient?: string;
      limit?: number;
      status?: 'pending' | 'sent' | 'failed';
    }
  ) {
    return getDeliveryHistory(tenantId, options);
  }

  /**
   * Get failed email count for alerting
   */
  static async getFailedEmailCount(tenantId: string): Promise<number> {
    const logs = await getDeliveryHistory(tenantId, {
      status: 'failed'
    });

    return logs.length;
  }
}
