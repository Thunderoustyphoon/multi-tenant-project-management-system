import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

let redis: RedisClientType | null = null;

export async function initializeRedis(): Promise<RedisClientType> {
  if (redis) {
    return redis;
  }

  redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redis.on('error', (err) => {
    logger.error('Redis Error', err);
  });

  redis.on('connect', () => {
    logger.info('Redis connected');
  });

  await redis.connect();

  // Shutdown is handled centrally in server.ts (startServer)
  // Removed duplicate SIGINT/SIGTERM handlers

  return redis;
}

export function getRedis(): RedisClientType {
  if (!redis) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redis;
}

// Lazy getter — callers must invoke redisClient() to get the Redis instance
// Do NOT eagerly call getRedis() here; it throws before initializeRedis() runs
export { getRedis as redisClient };
