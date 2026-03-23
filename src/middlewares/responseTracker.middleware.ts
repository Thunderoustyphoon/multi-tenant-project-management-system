/**
 * Response Time Tracker Middleware
 * Tracks request durations in a circular buffer for the last 60 seconds
 * Used by GET /health to report average response time
 */

interface RequestRecord {
  timestamp: number;
  duration: number;
  endpoint: string;
  tenantId?: string;
}

class ResponseTimeTracker {
  private records: RequestRecord[] = [];
  private maxAge = 60000; // 60 seconds

  /**
   * Record a completed request
   */
  record(duration: number, endpoint: string, tenantId?: string): void {
    const now = Date.now();
    this.records.push({ timestamp: now, duration, endpoint, tenantId });
    this.cleanup(now);
  }

  /**
   * Get average response time over the last 60 seconds
   */
  getAverageResponseTime(): number {
    this.cleanup(Date.now());
    if (this.records.length === 0) return 0;
    const total = this.records.reduce((sum, r) => sum + r.duration, 0);
    return Math.round(total / this.records.length);
  }

  /**
   * Get total request count in the last 60 seconds
   */
  getRequestCount(): number {
    this.cleanup(Date.now());
    return this.records.length;
  }

  /**
   * Get per-tenant stats for the current billing period (last 30 days approximated by in-memory last 60s)
   */
  getPerTenantStats(): Record<string, {
    totalRequests: number;
    requestsByEndpoint: Record<string, number>;
    averageResponseTime: number;
  }> {
    this.cleanup(Date.now());
    const stats: Record<string, {
      totalRequests: number;
      requestsByEndpoint: Record<string, number>;
      totalDuration: number;
    }> = {};

    for (const record of this.records) {
      const tid = record.tenantId || 'unknown';
      if (!stats[tid]) {
        stats[tid] = { totalRequests: 0, requestsByEndpoint: {}, totalDuration: 0 };
      }
      stats[tid].totalRequests++;
      stats[tid].totalDuration += record.duration;
      stats[tid].requestsByEndpoint[record.endpoint] =
        (stats[tid].requestsByEndpoint[record.endpoint] || 0) + 1;
    }

    const result: Record<string, { totalRequests: number; requestsByEndpoint: Record<string, number>; averageResponseTime: number }> = {};
    for (const [tid, s] of Object.entries(stats)) {
      result[tid] = {
        totalRequests: s.totalRequests,
        requestsByEndpoint: s.requestsByEndpoint,
        averageResponseTime: Math.round(s.totalDuration / s.totalRequests),
      };
    }

    return result;
  }

  /**
   * Remove records older than 60 seconds
   */
  private cleanup(now: number): void {
    const cutoff = now - this.maxAge;
    this.records = this.records.filter((r) => r.timestamp >= cutoff);
  }
}

// Singleton instance
export const responseTracker = new ResponseTimeTracker();

/**
 * Express middleware that tracks response time
 */
import { Request, Response, NextFunction } from 'express';

interface TrackedRequest extends Request {
  tenant?: { id: string };
}

export function responseTimeMiddleware(req: TrackedRequest, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Hook into res.finish event
  res.on('finish', () => {
    const duration = Date.now() - start;
    const tenantId = req.tenant?.id;
    responseTracker.record(duration, req.path, tenantId);
  });

  next();
}
