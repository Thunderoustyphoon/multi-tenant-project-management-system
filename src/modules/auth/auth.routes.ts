import { Router } from 'express';
import * as authController from './auth.controller';
import { tenantExtractorMiddleware } from '../../middlewares/tenantExtractor.middleware';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new tenant with owner user and initial API key
 * Public endpoint - no authentication required
 * 
 * Request body:
 * {
 *   "email": "owner@example.com",
 *   "name": "Owner Name",
 *   "password": "SecurePass123!",
 *   "tenantName": "My Company",
 *   "tenantSlug": "my-company"
 * }
 * 
 * Response (201):
 * {
 *   "success": true,
 *   "message": "Tenant registered successfully",
 *   "data": {
 *     "tenant": {...},
 *     "user": {...},
 *     "apiKey": {
 *       "id": "...",
 *       "key": "vz_xxxxx...", // Only shown once
 *       "prefix": "vz_",
 *       "createdAt": "2024-01-01T..."
 *     }
 *   }
 * }
 */
router.post('/register', authController.register);

/**
 * POST /api/auth/api-keys
 * Generate a new API key for the tenant
 * Authentication: Required - Bearer <api_key>
 * Authorization: Owner-only
 * 
 * Request body:
 * {
 *   "name": "Production Key"
 * }
 * 
 * Response (201):
 * {
 *   "success": true,
 *   "message": "API key generated successfully",
 *   "data": {
 *     "id": "key_xxx",
 *     "key": "vz_xxxxx...", // Only shown once
 *     "name": "Production Key",
 *     "prefix": "vz_",
 *     "createdAt": "2024-01-01T..."
 *   }
 * }
 */
router.post('/api-keys', tenantExtractorMiddleware, authController.generateApiKey);

/**
 * GET /api/auth/api-keys
 * List all API keys for the current tenant
 * Authentication: Required - Bearer <api_key>
 * Authorization: Owner-only
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "message": "API keys retrieved successfully",
 *   "data": {
 *     "totalKeys": 2,
 *     "keys": [
 *       {
 *         "id": "key_xxx",
 *         "name": "Production Key",
 *         "prefix": "vz_",
 *         "status": "active",
 *         "createdAt": "2024-01-01T...",
 *         "lastUsed": "2024-01-15T...",
 *         "revokedAt": null
 *       }
 *     ]
 *   }
 * }
 */
router.get('/api-keys', tenantExtractorMiddleware, authController.listApiKeys);

/**
 * POST /api/auth/api-keys/:keyId/rotate
 * Rotate an API key (old key remains valid for 15 minutes)
 * Authentication: Required - Bearer <api_key>
 * Authorization: Owner-only
 * 
 * Request body:
 * {}
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "message": "API key rotated successfully",
 *   "data": {
 *     "oldKey": {
 *       "id": "key_old",
 *       "gracePeriodUntil": "2024-01-01T12:15:00Z",
 *       "status": "inactive"
 *     },
 *     "newKey": {
 *       "id": "key_new",
 *       "key": "vz_xxxxx...", // Only shown once
 *       "prefix": "vz_",
 *       "createdAt": "2024-01-01T12:00:00Z"
 *     }
 *   }
 * }
 */
router.post('/api-keys/:keyId/rotate', tenantExtractorMiddleware, authController.rotateApiKey);

/**
 * DELETE /api/auth/api-keys/:keyId
 * Revoke an API key (cannot be undone)
 * Authentication: Required - Bearer <api_key>
 * Authorization: Owner-only
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "message": "API key revoked successfully",
 *   "data": {
 *     "id": "key_xxx",
 *     "status": "revoked",
 *     "revokedAt": "2024-01-01T..."
 *   }
 * }
 */
router.delete('/api-keys/:keyId', tenantExtractorMiddleware, authController.revokeApiKey);

export default router;
