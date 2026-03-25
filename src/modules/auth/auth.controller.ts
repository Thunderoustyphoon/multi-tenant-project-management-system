import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { registerSchema, createApiKeySchema, rotateApiKeySchema } from './auth.validation';
import { TenantRequest } from '../../types';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../middlewares/error.middleware';
import { EmailService } from '../../services/email.service';
import logger from '../../utils/logger';

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


    // Audit log is already created inside authService.registerTenant transaction


    try {
      await EmailService.sendWelcomeEmail(
        result.tenant.id,
        result.user.email,
        result.user.name,
        result.tenant.name
      );
    } catch (emailErr) {
      logger.error('Failed to queue welcome email:', emailErr);
  
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

    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context not found');
    }


    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can generate API keys');
    }

    const validation = createApiKeySchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid API key creation data', validation.error.issues);
    }

    const { name } = validation.data;

    const result = await authService.generateApiKey(req.tenant.id, req.user!.id);


    // Audit log is already created inside authService.generateApiKey

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
    const result = await authService.rotateApiKey(req.tenant.id, req.user!.id, keyId);

    // Audit log is already created inside authService.rotateApiKey

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
      logger.error('Failed to queue API key rotation email:', emailErr);
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

    const keys = await authService.listApiKeys(req.tenant.id, req.user!.id);

    // Audit log is already created inside authService.listApiKeys
    // Note: listing audit is optional — currently logged by service for completeness

    res.status(200).json({
      success: true,
      message: 'API keys retrieved successfully',
      data: {
        totalKeys: keys.length,
        keys: keys.map((key: { id: string; name?: string; status: string; createdBy: string; createdAt: Date; isActive: boolean; lastUsedAt: Date | null; gracePeriodEnds?: Date | null; oldKeyExpiresAt?: Date | null }) => ({
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

    const revokedKey = await authService.revokeApiKey(req.tenant.id, req.user!.id, keyId);

    // Audit log is already created inside authService.revokeApiKey

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
