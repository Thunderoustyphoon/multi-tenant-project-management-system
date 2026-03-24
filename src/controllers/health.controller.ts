import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { getRedis } from '../config/redis';
import { getQueueStats } from '../queues/email.queue';
import { TenantRequest } from '../types';
import { ForbiddenError, UnauthorizedError } from '../middlewares/error.middleware';
import { responseTracker } from '../middlewares/responseTracker.middleware';

/**
 * GET /health
 * Basic health check endpoint (public, no auth required)
 * Spec: must include "average response time over the last 60 seconds"
 */
export async function healthCheck(req: Request, res: Response) {
  const checks: Record<string, unknown> = {
    status: 'starting',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    averageResponseTime: responseTracker.getAverageResponseTime(),
    requestsPerMinute: responseTracker.getRequestCount(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    }
  };

  try {
    // Database connectivity check
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbTime = Date.now() - dbStart;

    checks.database = {
      status: 'connected',
      responseTime: dbTime,
      url: process.env.DATABASE_URL?.split('@')[1] || 'configured'
    };
  } catch (err) {
    checks.database = {
      status: 'error',
      error: (err as Error).message
    };
  }

  try {
    // Redis connectivity check
    const redis = getRedis();
    const redisStart = Date.now();
    await redis.ping();
    const redisTime = Date.now() - redisStart;

    checks.redis = {
      status: 'connected',
      responseTime: redisTime,
      host: process.env.REDIS_HOST || 'localhost'
    };
  } catch (err) {
    checks.redis = {
      status: 'error',
      error: (err as Error).message
    };
  }

  // Queue depth check (spec: "queue depth (pending + failed jobs)")
  try {
    const queueStats = await getQueueStats();
    checks.queues = {
      pending: queueStats.emailQueue.waiting + queueStats.emailQueue.delayed,
      failed: queueStats.emailQueue.failed,
      active: queueStats.emailQueue.active,
      deadLetterQueue: queueStats.deadLetterQueue.count
    };
  } catch (err) {
    checks.queues = {
      status: 'unavailable',
      error: (err as Error).message
    };
  }

  // Overall status
  const allHealthy = (checks.database as Record<string, unknown>)?.status === 'connected' && (checks.redis as Record<string, unknown>)?.status === 'connected';
  checks.status = allHealthy ? 'healthy' : 'unhealthy';

  const statusCode = allHealthy ? 200 : 503;

  return res.status(statusCode).json(checks);
}

/**
 * GET /metrics
 * Detailed metrics endpoint (internal API key only)
 * Spec: must include per-tenant billing-period stats
 */
export async function getMetrics(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Auth is handled by verifyInternalKey middleware on the route

    const metrics: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.VERSION || '1.0.0'
    };

    // Server metrics
    metrics.server = {
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        maxHeap: process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || 'default',
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      cpu: {
        usage: process.cpuUsage()
      },
      averageResponseTime: responseTracker.getAverageResponseTime(),
      requestsPerMinute: responseTracker.getRequestCount(),
    };

    // Database metrics
    try {
      const [tenantCount, userCount, auditCount] = await Promise.all([
        prisma.tenant.count(),
        prisma.user.count(),
        prisma.auditLog.count()
      ]);

      metrics.database = {
        status: 'connected',
        tenants: tenantCount,
        users: userCount,
        auditLogs: auditCount
      };
    } catch (err) {
      metrics.database = {
        status: 'error',
        error: (err as Error).message
      };
    }

    // Redis metrics
    try {
      const redis = getRedis();
      const info = await redis.info();
      const memory = info.split('\r\n').find(line => line.startsWith('used_memory_human'));
      const connectedClients = info.split('\r\n').find(line => line.startsWith('connected_clients'));

      metrics.redis = {
        status: 'connected',
        memory: memory?.split(':')[1]?.trim(),
        connectedClients: connectedClients?.split(':')[1]?.trim()
      };
    } catch (err) {
      metrics.redis = {
        status: 'error',
        error: (err as Error).message
      };
    }

    // Queue metrics
    try {
      const queueStats = await getQueueStats();
      metrics.queues = {
        emailQueue: queueStats.emailQueue,
        deadLetterQueue: queueStats.deadLetterQueue
      };
    } catch (err) {
      metrics.queues = {
        error: (err as Error).message
      };
    }

    // Rate limiter status
    metrics.rateLimiter = {
      enabled: true,
      thresholds: {
        global: '1000/min per tenant',
        endpoint: 'varies (5-500/min)',
        burst: '50/5sec'
      }
    };

    // Per-tenant billing-period stats (spec requirement)
    // Uses in-memory tracker for recent window + DB for historical
    try {
      const perTenantRecent = responseTracker.getPerTenantStats();

      // Get rate limit breach counts from DB
      const billingPeriodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

      const perTenantStats: Record<string, unknown> = {};
      for (const tenant of tenants) {
        const [rateLimitBreaches, emailLogs] = await Promise.all([
          prisma.rateLimitEvent.count({
            where: { tenantId: tenant.id, triggeredAt: { gte: billingPeriodStart } }
          }),
          prisma.emailDeliveryLog.groupBy({
            by: ['status'],
            where: { tenantId: tenant.id, createdAt: { gte: billingPeriodStart } },
            _count: true,
          }),
        ]);

        const emailStats = emailLogs.reduce((acc: Record<string, number>, log: { status: string; _count: number }) => {
          acc[log.status] = log._count;
          return acc;
        }, {} as Record<string, number>);

        const totalEmails = Object.values(emailStats).reduce((a: number, b: number) => a + b, 0);
        const sentEmails = emailStats['sent'] || 0;

        perTenantStats[tenant.id] = {
          tenantName: tenant.name,
          recentRequests: perTenantRecent[`tenant:${tenant.id}`]?.totalRequests || 0,
          recentRequestsByEndpoint: perTenantRecent[`tenant:${tenant.id}`]?.requestsByEndpoint || {},
          rateLimitBreachCount: rateLimitBreaches,
          emailDeliverySuccessRate: totalEmails > 0 ? Math.round((sentEmails / totalEmails) * 100) : 100,
        };
      }

      metrics.perTenantStats = perTenantStats;
    } catch (err) {
      metrics.perTenantStats = { error: (err as Error).message };
    }

    res.json(metrics);
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /status/:tenantId
 * Get tenant-specific status
 */
export async function getTenantStatus(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const [userCount, projectCount, taskCount, auditLogCount, apiKeyCount] = await Promise.all([
      prisma.user.count({ where: { tenantId: req.tenant.id } }),
      prisma.project.count({ where: { tenantId: req.tenant.id } }),
      prisma.task.count({ where: { tenantId: req.tenant.id } }),
      prisma.auditLog.count({ where: { tenantId: req.tenant.id } }),
      prisma.apiKey.count({ where: { tenantId: req.tenant.id } })
    ]);

    const status = {
      tenantId: req.tenant.id,
      tenantName: req.tenant.name,
      status: 'active',
      metrics: {
        users: userCount,
        projects: projectCount,
        tasks: taskCount,
        auditLogs: auditLogCount,
        apiKeys: apiKeyCount
      },
      createdAt: req.tenant.createdAt,
      lastActivityAt: new Date()
    };

    res.json({
      success: true,
      data: status
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /status/:tenantId/usage
 * Get tenant usage statistics
 */
export async function getTenantUsage(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      userCountLastMonth,
      projectCountLastMonth,
      auditLogsLastMonth,
      apiKeysCreatedLastMonth
    ] = await Promise.all([
      prisma.user.count({
        where: {
          tenantId: req.tenant.id,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.project.count({
        where: {
          tenantId: req.tenant.id,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.auditLog.count({
        where: {
          tenantId: req.tenant.id,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.apiKey.count({
        where: {
          tenantId: req.tenant.id,
          createdAt: { gte: thirtyDaysAgo }
        }
      })
    ]);

    const usage = {
      period: '30 days',
      startDate: thirtyDaysAgo.toISOString(),
      endDate: new Date().toISOString(),
      metrics: {
        usersCreated: userCountLastMonth,
        projectsCreated: projectCountLastMonth,
        auditLogsGenerated: auditLogsLastMonth,
        apiKeysCreated: apiKeysCreatedLastMonth
      }
    };

    res.json({
      success: true,
      data: usage
    });
    return;
  } catch (error) {
    next(error);
  }
}
