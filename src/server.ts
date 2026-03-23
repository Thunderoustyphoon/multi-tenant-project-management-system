import 'dotenv/config';
import express, { Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import prisma from './config/prisma';
import { initializeRedis, getRedis } from './config/redis';
import { errorHandler } from './middlewares/error.middleware';
import { rateLimitMiddleware } from './middlewares/rateLimit.middleware';
import { responseTimeMiddleware } from './middlewares/responseTracker.middleware';
import { rateLimiter } from './utils/rateLimiter';
import logger from './utils/logger';
import type { TenantRequest } from './types';

import { initializeQueues, shutdownQueues } from './queues/email.queue';
import routes from './routes';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration (restrict to known origins in production)
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Response time tracking (for GET /health averageResponseTime)
app.use(responseTimeMiddleware);

// Request logging middleware (for debugging)
app.use((req: TenantRequest, res, next) => {
  req.startTime = Date.now();
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Rate limiting middleware (3-tier: global, endpoint-specific, burst)
app.use(rateLimitMiddleware);

// API routes (includes /health, /metrics, /status endpoints)
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      details: { path: req.path, method: req.method }
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize Redis
    await initializeRedis();
    logger.info('Redis initialized');

    // Initialize rate limiter with Redis client
    const redis = getRedis();
    if (redis) {
      rateLimiter.setRedisClient(redis);
    }
    logger.info('Rate limiter initialized');

    // Initialize email queues
    await initializeQueues();
    logger.info('Email queues initialized');

    // Test Prisma connection
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Prisma connected to PostgreSQL');

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Handle server errors
    server.on('error', (err) => {
      logger.error('Server error', err);
      process.exit(1);
    });

    // Handle graceful shutdown
    const handleShutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close(async () => {
        await shutdownQueues();
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

// Only start if this is the main module
if (require.main === module) {
  startServer();
}

export default app;
