import 'dotenv/config';
import express, { Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';
import prisma from './config/prisma';
import { initializeRedis, getRedis } from './config/redis';
import { errorHandler } from './middlewares/error.middleware';
// Rate limit middleware is applied per-route, not globally
// import { rateLimitMiddleware } from './middlewares/rateLimit.middleware';
import { responseTimeMiddleware } from './middlewares/responseTracker.middleware';
import { rateLimiter } from './utils/rateLimiter';
import logger from './utils/logger';
import type { TenantRequest } from './types';

import { initializeQueues, shutdownQueues } from './queues/email.queue';
import routes from './routes';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ---------- Load OpenAPI spec ----------
const openapiPath = path.resolve(__dirname, '..', 'openapi.yaml');
const openapiDocument = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));

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

// Body parser middleware — 10MB limit prevents DoS via unlimited POST payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Rate limiting is applied per-route (project routes, task routes, etc.)
// NOT globally — tenant/API key context isn't available here yet

// ---------- API Documentation (Swagger UI) ----------
// Browse interactive docs at: http://localhost:3000/docs
// Raw JSON spec available at: http://localhost:3000/api-docs.json
app.get('/api-docs.json', (_req, res) => {
  res.json(openapiDocument);
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Multi-Tenant PM API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list',
    filter: true,
    tagsSorterAlpha: true,
  },
}));

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

// Graceful shutdown is handled in startServer() below
// (removed duplicate handlers that would exit before queue shutdown)

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
        // Disconnect Redis (was missing — left dangling connections)
        try {
          const redis = getRedis();
          await redis.disconnect();
        } catch (_) { /* Redis may not be initialized */ }
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
