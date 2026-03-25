import { Request, Response, NextFunction } from 'express';
import { rateLimiter } from '../utils/rateLimiter';
import { TooManyRequestsError } from './error.middleware';
import { getRedis } from '../config/redis';
import type { TenantRequest } from '../types';

export interface RateLimitedRequest extends Request {
  rateLimit?: {
    remaining: number;
    resetAt: number;
    limit: number;
  };
}

/**
 * Rate limiting middleware
 * Implements 3-tier sliding window rate limiting:
 * 1. Global: 1000 requests/min across ALL clients
 * 2. Endpoint-specific: Varies by endpoint (5-500 per min)
 * 3. Burst: 50 requests/5sec per client
 * 
 * Requires: tenantExtractor middleware to run first (for identifier)
 */
export async function rateLimitMiddleware(req: RateLimitedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Ensure Redis is initialized
    let redisClient;
    try {
      redisClient = getRedis();
    } catch (err) {
      return next(); // Skip rate limiting if Redis unavailable
    }

    // Get identifier (prefer tenant_id, fallback to API key, fallback to IP)
    let identifier = req.ip || '0.0.0.0';

    if ((req as unknown as TenantRequest).tenant?.id) {
      identifier = `tenant:${(req as unknown as TenantRequest).tenant?.id}`;
    } else if ((req as unknown as TenantRequest).apiKey?.id) {
      identifier = `apikey:${(req as unknown as TenantRequest).apiKey?.id}`;
    }

    // Build burst identifier from API key (spec: burst scope = "Per API key")
    let burstId: string | undefined;
    if ((req as unknown as TenantRequest).apiKey?.id) {
      burstId = `apikey:${(req as unknown as TenantRequest).apiKey?.id}`;
    }

    // Check rate limits
    const now = Date.now();
    const check = await rateLimiter.checkLimit(identifier, req.path, now, burstId);

    // Set rate limit headers for client
    res.setHeader('X-RateLimit-Limit', getEndpointLimitByPath(req.path));
    res.setHeader('X-RateLimit-Remaining', check.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(check.resetAt / 1000));

    if (!check.allowed) {
      const retryAfter = check.retryAfter || 60;
      res.setHeader('Retry-After', retryAfter);

      throw new TooManyRequestsError(
        `Rate limit exceeded: ${check.limitType || 'UNKNOWN'}`,
        {
          limitType: check.limitType,
          limit: check.limit,
          currentCount: check.currentCount,
          retryAfter,
          resetAt: new Date(check.resetAt).toISOString()
        }
      );
    }

    // Store rate limit info on request
    req.rateLimit = {
      remaining: check.remaining,
      resetAt: check.resetAt,
      limit: getEndpointLimitByPath(req.path)
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Helper to get endpoint-specific rate limit
 */
const rateLimitConfig: Record<string, number> = {
  '/api/auth/register': 5,
  '/api/auth/api-keys': 30,
  '/api/auth/api-keys/:keyId/rotate': 30,
  '/api/projects': 500,
  '/api/tasks': 500,
  '/api/workspaces': 100,
  '/api/audit/verify': 10,
  // Default for other endpoints
  'default': 500
};

function getEndpointLimitByPath(reqPath: string): number {
  // Normalize path (remove query string)
  const normalizedPath = reqPath.split('?')[0];
  
  // Check exact match first
  if (rateLimitConfig[normalizedPath]) {
    return rateLimitConfig[normalizedPath];
  }
  // Inside Express routers, req.path lacks /api prefix — try with prefix
  const apiPath = `/api${normalizedPath}`;
  if (rateLimitConfig[apiPath]) {
    return rateLimitConfig[apiPath];
  }

  // Check pattern matches
  if (normalizedPath.includes('/auth/')) return rateLimitConfig['/api/auth/register'] || 100;
  if (normalizedPath.includes('/projects')) return rateLimitConfig['/api/projects'] || 500;
  if (normalizedPath.includes('/tasks')) return rateLimitConfig['/api/tasks'] || 500;
  if (normalizedPath.includes('/workspaces')) return rateLimitConfig['/api/workspaces'] || 100;
  if (normalizedPath.includes('/audit')) return rateLimitConfig['/api/audit/verify'] || 10;

  return rateLimitConfig['default'];
}

// Add as method to middleware
// (removed - using standalone function instead)

/**
 * Optional: Admin endpoint to reset rate limits
 * POST /api/admin/reset-rate-limit
 * Body: { identifier: "tenant:xxx" or "apikey:yyy" }
 */
export async function resetRateLimitAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: Add admin authentication check
    const { identifier } = req.body;

    if (!identifier) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required field: identifier'
        }
      });
      return;
    }

    await rateLimiter.resetLimit(identifier);

    res.json({
      success: true,
      message: 'Rate limit reset successfully',
      identifier
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * Optional: Endpoint to get current rate limit status
 * GET /api/admin/rate-limit-status?identifier=xxx&endpoint=/api/projects
 */
export async function getRateLimitStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: Add admin authentication check
    const { identifier, endpoint } = req.query;

    if (!identifier || !endpoint) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required query params: identifier, endpoint'
        }
      });
      return;
    }

    const status = await rateLimiter.getStatus(String(identifier), String(endpoint));

    res.json({
      success: true,
      data: status
    });
    return;
  } catch (error) {
    next(error);
  }
}
