import type { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { generateSHA256Hash } from './crypto';
import logger from './logger';

/**
 * Create an audit log entry with SHA-256 chain hashing
 * Each entry includes SHA256(content + previousEntry.currentHash)
 * This makes the audit trail tamper-evident
 */
export async function createAuditLog(
  tx: PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  data: {
    tenantId: string;
    userId?: string;
    apiKeyId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
    ipAddress?: string;
    httpMethod?: string;
    endpoint?: string;
    statusCode?: number;
  }
) {
  // Get previous audit entry for this tenant to build chain
  const previousEntry = await tx.auditLog.findFirst({
    where: { tenantId: data.tenantId },
    orderBy: { createdAt: 'desc' },
    select: { currentHash: true }
  });

  const previousHash = previousEntry?.currentHash || '0'.repeat(64);

  // Fix: Generate timestamp BEFORE hash computation and pass it to Prisma
  // so that createdAt matches exactly what was hashed (avoids verification mismatch)
  const timestamp = new Date();

  // Build content for hashing (must be deterministic)
  const entryContent = {
    action: data.action,
    resourceType: data.resourceType,
    resourceId: data.resourceId,
    userId: data.userId,
    apiKeyId: data.apiKeyId,
    oldValue: data.oldValue,
    newValue: data.newValue,
    ipAddress: data.ipAddress,
    httpMethod: data.httpMethod,
    endpoint: data.endpoint,
    statusCode: data.statusCode,
    timestamp: timestamp.toISOString()
  };

  // Compute chain hash: SHA256(content + previousHash)
  const contentString = JSON.stringify(entryContent);
  const currentHash = generateSHA256Hash(contentString + previousHash);

  // Store audit log with chain — explicitly set createdAt to match hashed timestamp
  const auditLog = await tx.auditLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      apiKeyId: data.apiKeyId,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      oldValue: data.oldValue,
      newValue: data.newValue,
      ipAddress: data.ipAddress,
      httpMethod: data.httpMethod,
      endpoint: data.endpoint,
      statusCode: data.statusCode,
      previousHash,
      currentHash,
      createdAt: timestamp
    }
  });

  return auditLog;
}

/**
 * Verify the integrity of the entire audit chain for a tenant
 * Returns true if all hashes match, false if tampered
 * Spec requirement: "Verify endpoint: GET /audit/verify"
 */
export async function verifyAuditChain(tenantId: string): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAtId?: string;
  expectedHash?: string;
  storedHash?: string;
  lastVerified: Date;
}> {
  const entries = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      action: true,
      resourceType: true,
      resourceId: true,
      userId: true,
      apiKeyId: true,
      oldValue: true,
      newValue: true,
      ipAddress: true,
      httpMethod: true,
      endpoint: true,
      statusCode: true,
      previousHash: true,
      currentHash: true,
      createdAt: true
    }
  });

  let previousHash = '0'.repeat(64);

  for (const entry of entries) {
    // Reconstruct entry content (deterministic)
    const content = {
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      userId: entry.userId,
      apiKeyId: entry.apiKeyId,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      ipAddress: entry.ipAddress,
      httpMethod: entry.httpMethod,
      endpoint: entry.endpoint,
      statusCode: entry.statusCode,
      timestamp: entry.createdAt.toISOString()
    };

    // Recompute the hash
    const contentString = JSON.stringify(content);
    const recomputedHash = generateSHA256Hash(contentString + previousHash);

    // Compare with stored hash
    if (recomputedHash !== entry.currentHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtId: entry.id,
        expectedHash: recomputedHash,
        storedHash: entry.currentHash,
        lastVerified: new Date()
      };
    }

    // Check that previousHash matches expected
    if (entry.previousHash !== previousHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtId: entry.id,
        expectedHash: previousHash,
        storedHash: entry.previousHash,
        lastVerified: new Date()
      };
    }

    previousHash = entry.currentHash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    lastVerified: new Date()
  };
}

/**
 * Query audit logs with filters and cursor-based pagination
 * Spec requirement: "Audit logs queryable with filters and cursor-based pagination"
 */
export async function queryAuditLogs(
  tenantId: string,
  filters: {
    userId?: string;
    actionType?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
  },
  pagination: {
    cursor?: string;
    limit: number;
  }
): Promise<{
  data: unknown[];
  nextCursor?: string;
  hasMore: boolean;
}> {
  const limit = Math.min(pagination.limit, 100); // Max 100 per page

  // Build where clause
  const where: Prisma.AuditLogWhereInput = { tenantId };

  if (filters.userId) where.userId = filters.userId;
  if (filters.actionType) where.action = filters.actionType;
  if (filters.resourceType) where.resourceType = filters.resourceType;

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  // Decode cursor if provided
  let cursorCriteria: { createdAt: string; id: string } | undefined;
  if (pagination.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(pagination.cursor, 'base64').toString());
      cursorCriteria = decoded;
    } catch (err) {
      // Invalid cursor, start from beginning
    }
  }

  // Build cursor filter (keyset pagination)
  if (cursorCriteria) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursorCriteria.createdAt } },
          {
            AND: [
              { createdAt: { equals: cursorCriteria.createdAt } },
              { id: { lt: cursorCriteria.id } }
            ]
          }
        ]
      }
    ];
  }

  // Fetch one extra to determine hasMore
  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' }
    ],
    take: limit + 1
  });

  const hasMore = entries.length > limit;
  const data = hasMore ? entries.slice(0, limit) : entries;

  let nextCursor: string | undefined;
  if (hasMore && data.length > 0) {
    const lastEntry = data[data.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: lastEntry.createdAt.toISOString(),
        id: lastEntry.id
      })
    ).toString('base64');
  }

  return {
    data,
    nextCursor,
    hasMore
  };
}
