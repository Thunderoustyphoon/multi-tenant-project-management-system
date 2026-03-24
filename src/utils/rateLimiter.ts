import { createClient } from 'redis';
import { queueEmail } from '../queues/email.queue';
import prisma from '../config/prisma';
import logger from './logger';

export interface RateLimitConfig {
  // Global rate limits (per minute)
  globalLimit: number;
  globalWindow: number;

  // Endpoint-specific limits (per minute)
  endpointLimits: {
    [endpoint: string]: number;
  };

  // Burst protection (per 5 seconds)
  burstLimit: number;
  burstWindow: number;
}

/**
 * Default rate limit configuration per spec:
 * - Global: 1000 requests/min per tenant
 * - Endpoint: varies (500-100 depending on operation)
 * - Burst: 50 requests/5sec
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  globalLimit: 1000,
  globalWindow: 60, // seconds

  endpointLimits: {
    '/api/auth/register': 5, // 5 per minute
    '/api/auth/api-keys': 30, // 30 per minute
    '/api/projects': 500, // 500 per minute
    '/api/tasks': 500,
    '/api/workspaces': 100,
    '/api/audit/verify': 10, // Expensive verification
  },

  burstLimit: 50,
  burstWindow: 5, // seconds
};

/**
 * Sliding Window Rate Limiter using Redis
 * Implements 3-tier rate limiting:
 * 1. Global limit (1000/min per tenant — spec says scope is "per tenant")
 * 2. Endpoint-specific limits
 * 3. Burst protection (50/5sec per client)
 */
export class SlidingWindowRateLimiter {
  private redis: ReturnType<typeof createClient> | null = null;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
  }

  /**
   * Set Redis client instance
   */
  setRedisClient(client: ReturnType<typeof createClient>) {
    this.redis = client;
  }

  /**
   * Check if request is allowed (sliding window algorithm)
   * Returns: { allowed: boolean, remaining: number, resetAt: number, retryAfter?: number }
   */
  async checkLimit(
    identifier: string, // tenant_id for global/endpoint scoping
    endpoint: string,
    now: number = Date.now(),
    burstIdentifier?: string // per API key for burst protection (spec: scope = "Per API key")
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
    limitType?: string;
    limit?: number;
    currentCount?: number;
  }> {
    if (!this.redis) {
      throw new Error('Redis client not initialized');
    }

    // 1. Check global limit — scoped PER TENANT (not global timestamp)
    const globalKey = `rate:global:${identifier}`;
    const globalCheck = await this.checkSlidingWindow(
      globalKey,
      this.config.globalLimit,
      this.config.globalWindow,
      now
    );

    // Check 80% threshold for warning email
    await this.checkThresholdWarning(identifier, globalCheck.count, this.config.globalLimit);

    if (!globalCheck.allowed) {
      const windowEnd = now + this.config.globalWindow * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfter: Math.ceil((windowEnd - now) / 1000),
        limitType: 'GLOBAL',
        limit: this.config.globalLimit,
        currentCount: globalCheck.count
      };
    }

    // 2. Check endpoint-specific limit (per tenant + endpoint)
    const endpointLimit = this.config.endpointLimits[endpoint] || 500; // default 500/min
    const endpointKey = `rate:endpoint:${identifier}:${endpoint}`;
    const endpointCheck = await this.checkSlidingWindow(
      endpointKey,
      endpointLimit,
      this.config.globalWindow,
      now
    );

    if (!endpointCheck.allowed) {
      const windowEnd = now + this.config.globalWindow * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfter: Math.ceil((windowEnd - now) / 1000),
        limitType: 'ENDPOINT',
        limit: endpointLimit,
        currentCount: endpointCheck.count
      };
    }

    // 3. Check burst limit — scoped per API KEY (spec: burst scope = "Per API key")
    const burstId = burstIdentifier || identifier; // fallback to tenant if no API key
    const burstKey = `rate:burst:${burstId}`;
    const burstCheck = await this.checkSlidingWindow(
      burstKey,
      this.config.burstLimit,
      this.config.burstWindow,
      now
    );

    if (!burstCheck.allowed) {
      const windowEnd = now + this.config.burstWindow * 1000;
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfter: Math.ceil((windowEnd - now) / 1000),
        limitType: 'BURST',
        limit: this.config.burstLimit,
        currentCount: burstCheck.count
      };
    }

    return {
      allowed: true,
      remaining: Math.min(globalCheck.remaining, endpointCheck.remaining, burstCheck.remaining),
      resetAt: now + this.config.globalWindow * 1000
    };
  }

  /**
   * Check 80% threshold and send warning email (max 1 per hour per tenant)
   * Spec: "rate limit threshold warning (at 80% of global limit, send one warning email per hour maximum)"
   */
  private async checkThresholdWarning(
    identifier: string,
    currentCount: number,
    limit: number
  ): Promise<void> {
    if (!this.redis) return;

    const threshold = Math.floor(limit * 0.8);
    if (currentCount < threshold) return;

    // Dedup: only send one warning per hour per tenant
    const dedupKey = `rate:warning:sent:${identifier}`;
    const alreadySent = await this.redis.get(dedupKey);
    if (alreadySent) return;

    // Set dedup key with 1-hour expiry
    await this.redis.set(dedupKey, '1', { EX: 3600 });

    // Extract tenantId from identifier (format: "tenant:xxx")
    const tenantId = identifier.startsWith('tenant:') ? identifier.substring(7) : identifier;

    try {
      const tenantOwner = await prisma.user.findFirst({
        where: { tenantId, role: 'owner' },
        select: { email: true }
      });

      if (!tenantOwner?.email) {
        logger.warn(`No owner email found for tenant ${tenantId}, skipping rate limit warning`);
        return;
      }

      await queueEmail({
        tenantId,
        to: tenantOwner.email,
        subject: 'Rate Limit Warning: 80% threshold reached',
        htmlContent: `
          <h1>Rate Limit Warning</h1>
          <p>Your tenant has reached <strong>80%</strong> of the global rate limit.</p>
          <p>Current usage: <strong>${currentCount}/${limit}</strong> requests per minute.</p>
          <p>Consider optimizing your API usage to avoid hitting the limit.</p>
        `,
        templateType: 'RATE_LIMIT_WARNING',
        context: { currentCount, limit, percentage: Math.round((currentCount / limit) * 100) },
      });
    } catch (err) {
      // Don't fail the request if warning email fails
      logger.error('Failed to queue rate limit warning email', err);
    }
  }

  /**
   * Sliding window algorithm implementation using Redis sorted sets
   * Uses ZREMRANGEBYSCORE to remove old entries, ZCARD to count, ZADD to add
   */
  private async checkSlidingWindow(
    key: string,
    limit: number,
    windowSeconds: number,
    now: number = Date.now()
  ): Promise<{
    allowed: boolean;
    remaining: number;
    count: number;
  }> {
    if (!this.redis) {
      throw new Error('Redis client not initialized');
    }

    const thresholdTime = now - windowSeconds * 1000;

    // Remove old entries outside window using ZREMRANGEBYSCORE
    await this.redis.zRemRangeByScore(key, '-inf', thresholdTime);

    // Count requests in current window
    const count = await this.redis.zCard(key);

    // Check if limit exceeded
    const allowed = count < limit;
    const remaining = Math.max(0, limit - count);

    // Add current request timestamp
    if (allowed) {
      await this.redis.zAdd(key, [
        {
          score: now,
          value: `${now}-${Math.random()}`
        }
      ]);

      // Set expiration on key (cleanup old keys after window)
      await this.redis.expire(key, windowSeconds + 1);
    }

    return {
      allowed,
      remaining,
      count
    };
  }

  /**
   * Reset rate limit for an identifier (admin operation)
   */
  async resetLimit(identifier: string): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis client not initialized');
    }

    // Delete all keys matching pattern
    const keys = await this.redis.keys(`rate:*:${identifier}*`);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }

  /**
   * Get current rate limit status
   */
  async getStatus(identifier: string, endpoint: string): Promise<{
    global: { count: number; limit: number; percentage: number };
    endpoint: { count: number; limit: number; percentage: number };
    burst: { count: number; limit: number; percentage: number };
  }> {
    if (!this.redis) {
      throw new Error('Redis client not initialized');
    }

    const now = Date.now();

    const [globalCount, endpointCount, burstCount] = await Promise.all([
      this.redis.zCard(`rate:global:${identifier}`),
      this.redis.zCard(`rate:endpoint:${identifier}:${endpoint}`),
      this.redis.zCard(`rate:burst:${identifier}`)
    ]);

    const endpointLimit = this.config.endpointLimits[endpoint] || 500;

    return {
      global: {
        count: globalCount,
        limit: this.config.globalLimit,
        percentage: (globalCount / this.config.globalLimit) * 100
      },
      endpoint: {
        count: endpointCount,
        limit: endpointLimit,
        percentage: (endpointCount / endpointLimit) * 100
      },
      burst: {
        count: burstCount,
        limit: this.config.burstLimit,
        percentage: (burstCount / this.config.burstLimit) * 100
      }
    };
  }
}

// Singleton instance
export const rateLimiter = new SlidingWindowRateLimiter();
