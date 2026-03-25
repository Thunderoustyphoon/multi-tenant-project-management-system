/**
 * Integration Test: Sliding Window Rate Limiter
 * Spec: "Write integration tests for the rate limiting sliding window logic"
 * 
 * Tests that:
 * - Requests within window are counted
 * - Requests outside window are pruned (ZREMRANGEBYSCORE)
 * - Window boundaries work correctly
 * - 3-tier limits (global, endpoint, burst) are enforced
 */

import { SlidingWindowRateLimiter, RateLimitConfig } from '../src/utils/rateLimiter';

// Mock Redis client for testing
class MockRedis {
  private sortedSets: Map<string, Array<{ score: number; value: string }>> = new Map();
  private stringStore: Map<string, { value: string; expiresAt?: number }> = new Map();

  async zRemRangeByScore(key: string, min: string | number, max: string | number): Promise<number> {
    const set = this.sortedSets.get(key) || [];
    const maxVal = typeof max === 'string' ? (max === '+inf' ? Infinity : parseFloat(max)) : max;
    const before = set.length;
    this.sortedSets.set(key, set.filter(item => item.score > maxVal));
    return before - (this.sortedSets.get(key)?.length || 0);
  }

  async zCard(key: string): Promise<number> {
    return (this.sortedSets.get(key) || []).length;
  }

  async zAdd(key: string, members: Array<{ score: number; value: string }>): Promise<number> {
    const set = this.sortedSets.get(key) || [];
    set.push(...members);
    this.sortedSets.set(key, set);
    return members.length;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return true;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.stringStore.get(key)?.value || '0');
    this.stringStore.set(key, { value: String(current + 1) });
    return current + 1;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.stringStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.stringStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<string> {
    const expiresAt = options?.EX ? Date.now() + options.EX * 1000 : undefined;
    this.stringStore.set(key, { value, expiresAt });
    return 'OK';
  }

  async keys(pattern: string): Promise<string[]> {
    return [];
  }

  async del(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.sortedSets.delete(key) || this.stringStore.delete(key)) deleted++;
    }
    return deleted;
  }

  // Reset all data for test isolation
  clear(): void {
    this.sortedSets.clear();
    this.stringStore.clear();
  }
}

describe('Sliding Window Rate Limiter', () => {
  let limiter: SlidingWindowRateLimiter;
  let mockRedis: MockRedis;

  const testConfig: RateLimitConfig = {
    globalLimit: 10,       // 10 requests per minute for testing
    globalWindow: 60,      // 60 second window
    endpointLimits: {
      '/api/test': 5,      // 5 per minute
    },
    burstLimit: 3,         // 3 per 5 seconds
    burstWindow: 5,
  };

  beforeEach(() => {
    mockRedis = new MockRedis();
    limiter = new SlidingWindowRateLimiter(testConfig);
    limiter.setRedisClient(mockRedis as any);
  });

  afterEach(() => {
    mockRedis.clear();
  });

  test('should allow requests within the global limit', async () => {
    const identifier = 'tenant:test-tenant-1';
    const now = Date.now();

    // First request should be allowed
    const result = await limiter.checkLimit(identifier, '/api/other', now);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  test('should block requests exceeding the global limit', async () => {
    const identifier = 'tenant:test-tenant-2';
    const now = Date.now();

    // Fill up the global limit
    for (let i = 0; i < testConfig.globalLimit; i++) {
      const result = await limiter.checkLimit(identifier, '/api/other', now + i * 2000);
      expect(result.allowed).toBe(true);
    }

    // Next request should be blocked (using latest time)
    const blocked = await limiter.checkLimit(identifier, '/api/other', now + testConfig.globalLimit * 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitType).toBe('GLOBAL');
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeDefined();
  });

  test('should enforce endpoint-specific limits', async () => {
    const identifier = 'tenant:test-tenant-3';
    const now = Date.now();
    const endpointLimit = testConfig.endpointLimits['/api/test']!;

    // Fill up endpoint limit (5 requests)
    for (let i = 0; i < endpointLimit; i++) {
      const result = await limiter.checkLimit(identifier, '/api/test', now + i * 2000);
      expect(result.allowed).toBe(true);
    }

    // Next request to same endpoint should be blocked
    const blocked = await limiter.checkLimit(identifier, '/api/test', now + endpointLimit * 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitType).toBe('ENDPOINT');
  });

  test('should enforce burst limits', async () => {
    const identifier = 'tenant:test-tenant-4';
    const now = Date.now();

    // Send burst limit (3 requests) in rapid succession
    for (let i = 0; i < testConfig.burstLimit; i++) {
      const result = await limiter.checkLimit(identifier, '/api/other', now + i);
      expect(result.allowed).toBe(true);
    }

    // Next rapid request should be blocked by burst limit
    const blocked = await limiter.checkLimit(identifier, '/api/other', now + testConfig.burstLimit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitType).toBe('BURST');
  });

  test('should prune old entries outside the sliding window', async () => {
    const identifier = 'tenant:test-tenant-5';
    const now = Date.now();
    const windowMs = testConfig.globalWindow * 1000;

    // Send requests at time T (spaced to avoid burst limits)
    for (let i = 0; i < testConfig.globalLimit; i++) {
      await limiter.checkLimit(identifier, '/api/other', now + i * 2000);
    }

    // Verify at limit
    const atLimit = await limiter.checkLimit(identifier, '/api/other', now + testConfig.globalLimit * 2000);
    expect(atLimit.allowed).toBe(false);

    // Advance time past the window boundary + all spaced requests
    const futureTime = now + windowMs + 20000; // past the 18s spread + window

    // Request should be allowed now (old entries pruned by ZREMRANGEBYSCORE)
    const result = await limiter.checkLimit(identifier, '/api/other', futureTime);
    // Burst limit restricts the max remaining capacity to burstLimit
    expect(result.remaining).toBe(Math.min(testConfig.globalLimit - 1, testConfig.burstLimit));
  });

  test('should maintain correct remaining count', async () => {
    const identifier = 'tenant:test-tenant-6';
    const now = Date.now();

    const result1 = await limiter.checkLimit(identifier, '/api/other', now);
    // After first request, remaining should be globalLimit - 1 (or min of all tiers)
    expect(result1.remaining).toBeLessThanOrEqual(testConfig.globalLimit - 1);

    const result2 = await limiter.checkLimit(identifier, '/api/other', now + 1);
    expect(result2.remaining).toBeLessThan(result1.remaining);
  });

  test('should scope global limit per tenant (different tenants are independent)', async () => {
    const tenant1 = 'tenant:tenant-a';
    const tenant2 = 'tenant:tenant-b';
    const now = Date.now();

    // Fill tenant1's limit
    for (let i = 0; i < testConfig.globalLimit; i++) {
      await limiter.checkLimit(tenant1, '/api/other', now + i * 2000);
    }

    // tenant1 should be blocked
    const blocked = await limiter.checkLimit(tenant1, '/api/other', now + testConfig.globalLimit * 2000);
    expect(blocked.allowed).toBe(false);

    // tenant2 should still be allowed (independent scope)
    const allowed = await limiter.checkLimit(tenant2, '/api/other', now);
    expect(allowed.allowed).toBe(true);
  });

  test('should return correct resetAt timestamp', async () => {
    const identifier = 'tenant:test-tenant-7';
    const now = Date.now();

    const result = await limiter.checkLimit(identifier, '/api/other', now);
    expect(result.resetAt).toBeGreaterThan(now);
    // Reset should be approximately globalWindow seconds from now
    const expectedReset = now + testConfig.globalWindow * 1000;
    expect(result.resetAt).toBe(expectedReset);
  });
});
