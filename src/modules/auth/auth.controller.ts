import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, createApiKeySchema, rotateApiKeySchema } from './auth.validation';
import { TenantRequest } from '../../types';
import { ValidationError, ConflictError, UnauthorizedError, ForbiddenError } from '../../middlewares/error.middleware';
import { createAuditLog } from '../../utils/audit.utils';
import { EmailService } from '../../services/email.service';
import prisma from '../../config/prisma';

const authService = new AuthService();

/**
 * POST /api/auth/register
 * Register a new tenant with owner user and initial API key
 * Public endpoint (no authentication required)
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid registration data', (validation.error as unknown as { issues: unknown[] }).issues);
    }

    const { email, name, password, tenantName, tenantSlug } = validation.data;

    const result = await authService.registerTenant({
      email,
      name,
      password,
      tenantName,
      tenantSlug
    });

    // Log registration
    await createAuditLog(prisma, {
      tenantId: result.tenant.id,
      userId: result.user.id,
      action: 'TENANT_REGISTRATION',
      resourceType: 'Tenant',
      resourceId: result.tenant.id,
      newValue: {
        tenantName: result.tenant.name,
        ownerEmail: result.user.email
      },
      ipAddress: req.ip,
      httpMethod: 'POST',
      endpoint: '/api/auth/register',
      statusCode: 201
    });

    // Send welcome email asynchronously (non-blocking)
    try {
      await EmailService.sendWelcomeEmail(
        result.tenant.id,
        result.user.email,
        result.user.name,
        result.tenant.name
      );
    } catch (emailErr) {
      console.error('Failed to queue welcome email:', emailErr);
      // Don't fail registration if email queuing fails
    }

    res.status(201).json({
      success: true,
      message: 'Tenant registered successfully',
      data: {
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug
        },
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role
        },
        apiKey: {
          id: result.apiKey.id,
          key: result.apiKey.key, // Only shown once at creation
          prefix: 'vz_',
          createdAt: result.apiKey.createdAt
        }
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/api-keys
 * Generate a new API key for the tenant (owner-only)
 * Requires: Bearer <api_key> authentication
 */
export async function generateApiKey(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Verify request has tenant context (set by tenantExtractor middleware)
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context not found');
    }

    // Verify user is owner
    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can generate API keys');
    }

    const validation = createApiKeySchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid API key creation data', validation.error.issues);
    }

    const { name } = validation.data;

    const result = await authService.generateApiKey(req.tenant.id, req.user?.id!);

    // Log key generation
    await createAuditLog(prisma, {
      tenantId: req.tenant.id,
      userId: req.user?.id,
      apiKeyId: result.id,
      action: 'API_KEY_GENERATED',
      resourceType: 'ApiKey',
      resourceId: result.id,
      newValue: {
        keyName: name,
        prefix: 'vz_'
      },
      ipAddress: req.ip,
      httpMethod: 'POST',
      endpoint: '/api/auth/api-keys',
      statusCode: 201
    });

    res.status(201).json({
      success: true,
      message: 'API key generated successfully',
      data: {
        id: result.id,
        key: result.key, // Only shown once
        prefix: 'vz_',
        createdAt: result.createdAt
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/api-keys/:keyId/rotate
 * Rotate an API key (15-min grace period for old key)
 * Owner-only operation
 */
export async function rotateApiKey(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context not found');
    }

    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can rotate API keys');
    }

    const { keyId } = req.params;

    const validation = rotateApiKeySchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid rotation data', validation.error.issues);
    }

    // Note: service expects (tenantId, userId, apiKeyId)
    const result = await authService.rotateApiKey(req.tenant.id, req.user?.id!, keyId);

    // Log rotation
    await createAuditLog(prisma, {
      tenantId: req.tenant.id,
      userId: req.user?.id,
      apiKeyId: keyId,
      action: 'API_KEY_ROTATED',
      resourceType: 'ApiKey',
      resourceId: keyId,
      oldValue: {
        keyId
      },
      newValue: {
        newKeyId: result.id,
        gracePeriodUntil: result.graceExpiresAt
      },
      ipAddress: req.ip,
      httpMethod: 'POST',
      endpoint: `/api/auth/api-keys/${keyId}/rotate`,
      statusCode: 200
    });

    // Send rotation notification email asynchronously
    try {
      await EmailService.sendApiKeyRotatedEmail(
        req.tenant.id,
        req.user?.email || '',
        req.user?.name || 'Owner',
        keyId,
        result.graceExpiresAt
      );
    } catch (emailErr) {
      console.error('Failed to queue API key rotation email:', emailErr);
      // Don't fail rotation if email queuing fails
    }

    res.status(200).json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        oldKey: {
          id: keyId,
          gracePeriodUntil: result.graceExpiresAt,
          status: 'inactive'
        },
        newKey: {
          id: result.id,
          key: result.key, // Only shown once
          prefix: 'vz_'
        }
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/api-keys
 * List all API keys for the tenant (owner-only)
 */
export async function listApiKeys(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context not found');
    }

    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can list API keys');
    }

    const keys = await authService.listApiKeys(req.tenant.id, req.user?.id!);

    // Log access
    await createAuditLog(prisma, {
      tenantId: req.tenant.id,
      userId: req.user?.id,
      action: 'API_KEYS_LISTED',
      resourceType: 'ApiKey',
      ipAddress: req.ip,
      httpMethod: 'GET',
      endpoint: '/api/auth/api-keys',
      statusCode: 200
    });

    res.status(200).json({
      success: true,
      message: 'API keys retrieved successfully',
      data: {
        totalKeys: keys.length,
        keys: keys.map((key: any) => ({
          id: key.id,
          name: key.name,
          prefix: 'vz_',
          status: key.status,
          createdAt: key.createdAt,
          lastUsed: key.lastUsedAt,
          gracePeriodEnds: key.gracePeriodEnds
        }))
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/auth/api-keys/:keyId
 * Revoke an API key (owner-only)
 */
export async function revokeApiKey(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context not found');
    }

    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can revoke API keys');
    }

    const { keyId } = req.params;

    const revokedKey = await authService.revokeApiKey(req.tenant.id, req.user?.id!, keyId);

    // Log revocation
    await createAuditLog(prisma, {
      tenantId: req.tenant.id,
      userId: req.user?.id,
      apiKeyId: revokedKey.id,
      action: 'API_KEY_REVOKED',
      resourceType: 'ApiKey',
      resourceId: keyId,
      oldValue: {
        status: 'active'
      },
      newValue: {
        status: revokedKey.status
      },
      ipAddress: req.ip,
      httpMethod: 'DELETE',
      endpoint: `/api/auth/api-keys/${keyId}`,
      statusCode: 200
    });

    res.status(200).json({
      success: true,
      message: 'API key revoked successfully',
      data: {
        id: revokedKey.id,
        status: revokedKey.status
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}
