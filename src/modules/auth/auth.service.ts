import argon2 from 'argon2';
import prisma from '../../config/prisma';
import { generateApiKey, hashApiKey } from '../../utils/crypto';
import { createAuditLog } from '../../utils/audit.utils';
import { ValidationError, ConflictError } from '../../middlewares/error.middleware';

export class AuthService {
  /**
   * Register a new tenant and admin user with initial API key
   */
  async registerTenant(input: {
    email: string;
    name: string;
    password: string;
    tenantName: string;
    tenantSlug: string;
  }) {
    // Verify tenant slug is unique
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: input.tenantSlug }
    });

    if (existingTenant) {
      throw new ConflictError('Tenant slug already exists');
    }

    // Verify email is unique globally (not just per tenant)
    const existingUser = await prisma.user.findFirst({
      where: { email: input.email }
    });

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1
    });

    // Create tenant, user, and initial API key in transaction
    const result = await prisma.$transaction(async (tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName,
          slug: input.tenantSlug
        }
      });

      // Create user as owner
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email,
          name: input.name,
          passwordHash,
          role: 'owner',
          isEmailVerified: false,
          status: 'active'
        }
      });

      // Generate initial API key
      const rawKey = generateApiKey();
      const keyHash = await hashApiKey(rawKey);

      const apiKey = await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          keyHash,
          createdBy: user.id,
          isActive: true
        }
      });

      // Create audit log for tenant creation
      await createAuditLog(tx, {
        tenantId: tenant.id,
        userId: user.id,
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: tenant.id,
        newValue: { name: tenant.name, slug: tenant.slug },
        ipAddress: 'registration-flow'
      });

      return { tenant, user, apiKey, rawKey };
    });

    // Return only what's needed (raw API key shown only once)
    return {
      tenant: result.tenant,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role
      },
      apiKey: {
        id: result.apiKey.id,
        key: result.rawKey, // Raw key shown ONLY at creation
        createdAt: result.apiKey.createdAt
      }
    };
  }

  /**
   * Generate a new API key for a tenant
   * Returns the raw key (shown only once) and the API key record
   */
  async generateApiKey(tenantId: string, userId: string) {
    // Verify user is owner in this tenant
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        role: 'owner' // Only owners can generate keys
      }
    });

    if (!user) {
      throw new ValidationError('Only tenant owners can generate API keys');
    }

    // Generate raw key and hash it
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);

    // Store only the hash
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId,
        keyHash,
        createdBy: userId,
        isActive: true
      }
    });

    // Log audit event
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'apikey.generated',
      resourceType: 'apikey',
      resourceId: apiKey.id,
      newValue: { keyId: apiKey.id, createdBy: userId }
    });

    return {
      id: apiKey.id,
      key: rawKey, // Raw key shown ONLY at creation
      createdAt: apiKey.createdAt
    };
  }

  /**
   * Rotate an API key
   * Old key remains valid for exactly 15 minutes, then expires
   * Spec requirement: "Key rotation: an Owner can rotate their API key — the old key must remain valid for exactly 15 minutes after rotation to allow graceful transition, then expire"
   */
  async rotateApiKey(tenantId: string, userId: string, apiKeyId: string) {
    // Verify user is owner
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        role: 'owner'
      }
    });

    if (!user) {
      throw new ValidationError('Only tenant owners can rotate API keys');
    }

    // Verify API key belongs to this tenant
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        tenantId,
        isActive: true
      }
    });

    if (!apiKey) {
      throw new ValidationError('API key not found or inactive');
    }

    // Generate new key
    const newRawKey = generateApiKey();
    const newKeyHash = await hashApiKey(newRawKey);

    // Calculate grace period expiration (15 minutes from now)
    const graceExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Update API key with grace period
    const rotatedKey = await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        keyHash: newKeyHash,
        rotatedAt: new Date(),
        oldKeyHash: apiKey.keyHash, // Store old hash for grace period
        oldKeyExpiresAt: graceExpiresAt
      }
    });

    // Log audit event
    await createAuditLog(prisma, {
      tenantId,
      userId,
      apiKeyId,
      action: 'apikey.rotated',
      resourceType: 'apikey',
      resourceId: apiKeyId,
      oldValue: { rotatedKeyId: apiKeyId },
      newValue: {
        rotatedAt: rotatedKey.rotatedAt,
        graceExpiresAt
      }
    });

    return {
      id: rotatedKey.id,
      key: newRawKey,
      graceExpiresAt,
      message: `Old API key will expire in 15 minutes. New key active immediately.`
    };
  }

  /**
   * List all API keys for a tenant (hashes only, not raw keys)
   */
  async listApiKeys(tenantId: string, userId: string) {
    // Verify user is owner
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        role: 'owner'
      }
    });

    if (!user) {
      throw new ValidationError('Only tenant owners can list API keys');
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        createdBy: true,
        createdAt: true,
        isActive: true,
        lastUsedAt: true,
        rotatedAt: true,
        oldKeyExpiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return apiKeys.map((key: { id: string; createdBy: string; createdAt: Date; isActive: boolean; lastUsedAt: Date | null; oldKeyExpiresAt?: Date | null }) => ({
      ...key,
      status: key.isActive ? 'active' : 'inactive',
      gracePeriodEnds: key.oldKeyExpiresAt
    }));
  }

  /**
   * Revoke an API key (mark as inactive)
   */
  async revokeApiKey(tenantId: string, userId: string, apiKeyId: string) {
    // Verify user is owner
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        role: 'owner'
      }
    });

    if (!user) {
      throw new ValidationError('Only tenant owners can revoke API keys');
    }

    // Verify API key belongs to this tenant
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        tenantId
      }
    });

    if (!apiKey) {
      throw new ValidationError('API key not found');
    }

    // Revoke the key
    const revokedKey = await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { isActive: false }
    });

    // Log audit event
    await createAuditLog(prisma, {
      tenantId,
      userId,
      apiKeyId,
      action: 'apikey.revoked',
      resourceType: 'apikey',
      resourceId: apiKeyId
    });

    return { id: revokedKey.id, status: 'revoked' };
  }
}

export default new AuthService();
