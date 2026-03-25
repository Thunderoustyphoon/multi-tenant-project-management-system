import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { TenantRequest } from '../types';
import { UnauthorizedError } from './error.middleware';
import { verifyApiKey } from '../utils/crypto';

/**
 * Extract tenant from API key on every request
 * This is the foundation of multi-tenant isolation per spec:
 * "Tenant resolution must happen via API key on every request"
 */
export async function extractTenantFromApiKey(
  req: TenantRequest,
  res: Response,
  next: NextFunction
) {
  try {

    if (req.path === '/health' || req.path === '/') {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid API key');
    }

    const rawKey = authHeader.substring(7);


    if (!rawKey.startsWith('vz_')) {
      throw new UnauthorizedError('Invalid API key format');
    }


    const apiKeys = await prisma.apiKey.findMany({
      where: { isActive: true },
      include: { tenant: true }
    });

    let apiKeyRecord: { id: string; tenantId: string; keyHash: string; createdBy: string; createdAt: Date; oldKeyHash?: string | null; oldKeyExpiresAt?: Date | null; isActive: boolean; tenant: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date } } | null = null;


    for (const record of apiKeys) {
      const isValid = await verifyApiKey(rawKey, record.keyHash);
      if (isValid) {
        apiKeyRecord = record;
        break;
      }
    }

    // Check old keys during grace period
    if (!apiKeyRecord) {
      const graceKeys = await prisma.apiKey.findMany({
        where: {
          oldKeyHash: { not: null },
          oldKeyExpiresAt: { gt: new Date() }
        },
        include: { tenant: true }
      });

      for (const record of graceKeys) {
        if (record.oldKeyHash) {
          const isValid = await verifyApiKey(rawKey, record.oldKeyHash);
          if (isValid) {
            apiKeyRecord = record;
            break;
          }
        }
      }
    }

    if (!apiKeyRecord) {
      throw new UnauthorizedError('Invalid API key');
    }


    req.tenant = apiKeyRecord.tenant;
    req.apiKey = apiKeyRecord as TenantRequest['apiKey'];


    const apiKeyUser = await prisma.user.findUnique({
      where: { id: apiKeyRecord.createdBy }
    });

    if (apiKeyUser) {
      req.user = {
        id: apiKeyUser.id,
        tenantId: apiKeyUser.tenantId,
        email: apiKeyUser.email,
        name: apiKeyUser.name,
        passwordHash: '', // Never expose hash to request context
        role: apiKeyUser.role as 'owner' | 'member',
        isEmailVerified: apiKeyUser.isEmailVerified,
        status: (apiKeyUser.status || 'active') as 'active' | 'suspended' | 'invited',
        createdAt: apiKeyUser.createdAt,
        updatedAt: apiKeyUser.updatedAt,
      };
    }


    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() }
    });


    req.ipAddress = req.ip || 'unknown';

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require authenticated tenant (must have tenant context)
 * Used on routes that need tenant context
 */
export function requireTenant(
  req: TenantRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.tenant) {
    return next(new UnauthorizedError('Tenant context required'));
  }
  next();
}

/**
 * Verify internal API key for admin endpoints like /health and /metrics
 * Uses INTERNAL_API_KEY environment variable
 */
export function verifyInternalKey(
  req: TenantRequest,
  res: Response,
  next: NextFunction
) {
  const internalKey = req.headers['x-internal-key'] as string;
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!internalKey || internalKey !== expectedKey) {
    return next(new UnauthorizedError('Invalid internal API key'));
  }

  next();
}

// Alias for convenience
export const tenantExtractorMiddleware = extractTenantFromApiKey;
