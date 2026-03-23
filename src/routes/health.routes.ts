import { Router } from 'express';
import { healthCheck, getMetrics, getTenantStatus, getTenantUsage } from '../controllers/health.controller';
import { tenantExtractorMiddleware, verifyInternalKey } from '../middlewares/tenantExtractor.middleware';

const router = Router();

/**
 * GET /health
 * Basic health check (no auth required)
 * Used by: Load balancers, health check services, Kubernetes probes
 * 
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-15T12:00:00Z",
 *   "uptime": 3600,
 *   "database": { "status": "connected", "responseTime": 5 },
 *   "redis": { "status": "connected", "responseTime": 2 },
 *   "queues": { "pending": 3, "failed": 0 }
 * }
 */
router.get('/health', healthCheck);

/**
 * GET /metrics
 * Detailed metrics for monitoring (internal API key only)
 * Protected by verifyInternalKey middleware (spec: "separate internal API key")
 * 
 * Headers: x-internal-key: <INTERNAL_API_KEY>
 */
router.get('/metrics', verifyInternalKey, getMetrics);

/**
 * GET /status/:tenantId
 * Tenant-specific status dashboard
 * Requires: Tenant API key
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "tenantId": "tenant_xxx",
 *     "tenantName": "My Company",
 *     "status": "active",
 *     "metrics": {
 *       "users": 5,
 *       "projects": 10,
 *       "tasks": 42,
 *       "auditLogs": 150,
 *       "apiKeys": 3
 *     }
 *   }
 * }
 */
router.get('/status/:tenantId', tenantExtractorMiddleware, getTenantStatus);

/**
 * GET /status/:tenantId/usage
 * Tenant usage statistics (last 30 days)
 * Requires: Tenant API key
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "period": "30 days",
 *     "metrics": {
 *       "usersCreated": 2,
 *       "projectsCreated": 3,
 *       "auditLogsGenerated": 100,
 *       "apiKeysCreated": 1
 *     }
 *   }
 * }
 */
router.get('/status/:tenantId/usage', tenantExtractorMiddleware, getTenantUsage);

export default router;
