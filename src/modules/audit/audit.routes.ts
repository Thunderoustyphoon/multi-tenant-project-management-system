import { Router, Request, Response, NextFunction } from 'express';
import { tenantExtractorMiddleware } from '../../middlewares/tenantExtractor.middleware';
import { ForbiddenError, NotFoundError } from '../../middlewares/error.middleware';
import { queryAuditLogs, verifyAuditChain, createAuditLog } from '../../utils/audit.utils';
import { TenantRequest } from '../../types';
import prisma from '../../config/prisma';

const router = Router();

/**
 * GET /api/audit/logs
 * Query audit logs with filters and cursor-based pagination
 * Authentication: Required - Bearer <api_key>
 * Authorization: Owner and Member (can see logs for their tenant)
 * 
 * Query params:
 * - userId: Filter by user
 * - actionType: Filter by action (e.g., API_KEY_GENERATED)
 * - resourceType: Filter by resource type
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - cursor: For pagination
 * - limit: Results per page (max 100, default 20)
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "message": "Audit logs retrieved",
 *   "data": {
 *     "logs": [...],
 *     "pagination": {
 *       "cursor": "...",
 *       "hasMore": false,
 *       "total": 42
 *     }
 *   }
 * }
 */
export async function getAuditLogs(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new ForbiddenError('Tenant context required');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursor = req.query.cursor as string | undefined;

    const filters = {
      userId: req.query.userId as string | undefined,
      actionType: req.query.actionType as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
    };

    const result = await queryAuditLogs(req.tenant.id, filters, { cursor, limit });

    res.json({
      success: true,
      message: 'Audit logs retrieved successfully',
      data: {
        logs: result.data,
        pagination: {
          cursor: result.nextCursor,
          hasMore: result.hasMore,
          limit
        }
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/audit/verify
 * Verify the integrity of the entire audit chain for the tenant
 * This is a CRITICAL endpoint per spec for tamper-evidence
 * Authentication: Required - Bearer <api_key>
 * Authorization: Owner-only (sensitive operation)
 * 
 * Response (200) if valid:
 * {
 *   "success": true,
 *   "message": "Audit chain is valid",
 *   "data": {
 *     "valid": true,
 *     "totalEntries": 42,
 *     "lastVerified": "2024-01-15T12:00:00Z"
 *   }
 * }
 * 
 * Response (200) if invalid:
 * {
 *   "success": false,
 *   "message": "Audit chain integrity check failed",
 *   "data": {
 *     "valid": false,
 *     "totalEntries": 42,
 *     "brokenAtId": "audit_xxx",
 *     "expectedHash": "sha256...",
 *     "storedHash": "sha256...",
 *     "lastVerified": "2024-01-15T12:00:00Z"
 *   }
 * }
 */
export async function verifyAuditChainEndpoint(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new ForbiddenError('Tenant context required');
    }

    // Owner-only operation
    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can verify audit chain (sensitive operation)');
    }

    // Verify the chain
    const result = await verifyAuditChain(req.tenant.id);

    // Log this verification attempt using createAuditLog to maintain chain integrity
    await createAuditLog(prisma, {
      tenantId: req.tenant.id,
      userId: req.user?.id,
      action: 'AUDIT_CHAIN_VERIFIED',
      resourceType: 'AuditLog',
      newValue: {
        valid: result.valid,
        totalEntries: result.totalEntries,
        ...(result.brokenAtId && { brokenAtId: result.brokenAtId })
      },
      ipAddress: req.ip,
      httpMethod: 'GET',
      endpoint: '/api/audit/verify',
      statusCode: 200
    });

    res.json({
      success: result.valid,
      message: result.valid ? 'Audit chain is valid and tamper-free' : 'Audit chain integrity check failed - possible tampering detected',
      data: result
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/audit/logs/:id
 * Get a specific audit log entry with chain information
 * Authentication: Required - Bearer <api_key>
 */
export async function getAuditLogEntry(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new ForbiddenError('Tenant context required');
    }

    const { id } = req.params;

    const entry = await prisma.auditLog.findFirst({
      where: {
        id,
        tenantId: req.tenant.id
      }
    });

    if (!entry) {
      throw new NotFoundError('Audit log entry not found');
    }

    res.json({
      success: true,
      message: 'Audit log entry retrieved',
      data: {
        id: entry.id,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        actor: {
          userId: entry.userId,
          apiKeyId: entry.apiKeyId
        },
        changes: {
          oldValue: entry.oldValue,
          newValue: entry.newValue
        },
        request: {
          method: entry.httpMethod,
          endpoint: entry.endpoint,
          statusCode: entry.statusCode,
          ipAddress: entry.ipAddress
        },
        chain: {
          previousHash: entry.previousHash,
          currentHash: entry.currentHash
        },
        timestamp: entry.createdAt
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/audit/export
 * Export audit logs for compliance/archival (owner-only)
 * Format: JSON, CSV, or PDF
 */
export async function exportAuditLogs(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new ForbiddenError('Tenant context required');
    }

    // Owner-only
    if (req.user?.role !== 'owner') {
      throw new ForbiddenError('Only tenant owners can export audit logs');
    }

    const format = (req.query.format as string) || 'json';
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Get logs
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenant.id,
        ...((startDate || endDate) && {
          createdAt: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) }),
          },
        }),
      },
      orderBy: { createdAt: 'asc' }
    });

    // Log the export action using createAuditLog to maintain chain integrity
    await createAuditLog(prisma, {
      tenantId: req.tenant.id,
      userId: req.user?.id,
      action: 'AUDIT_LOGS_EXPORTED',
      resourceType: 'AuditLog',
      newValue: {
        format,
        count: logs.length,
        dateRange: { startDate, endDate }
      },
      ipAddress: req.ip,
      httpMethod: 'GET',
      endpoint: '/api/audit/export',
      statusCode: 200
    });

    // Format output based on requested format
    if (format === 'csv') {
      // Simple CSV export with proper escaping to prevent CSV injection
      const headers = ['id', 'action', 'resource_type', 'user_id', 'status_code', 'created_at'];
      const escapeCsv = (val: unknown): string => {
        const str = val == null ? '' : String(val);
        // Quote fields that contain commas, quotes, newlines, or formula injection chars
        if (/[,"\n\r=+\-@]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const rows = logs.map((log: { id: string; action: string; resourceType: string | null; userId: string | null; statusCode: number | null; createdAt: Date }) => [
        escapeCsv(log.id),
        escapeCsv(log.action),
        escapeCsv(log.resourceType),
        escapeCsv(log.userId),
        escapeCsv(log.statusCode),
        escapeCsv(log.createdAt.toISOString())
      ]);

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString()}.csv"`);
      res.send(csv);
      return;
    }

    // Default: JSON export
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString()}.json"`);
    res.json({
      success: true,
      message: 'Audit logs exported',
      metadata: {
        tenantId: req.tenant.id,
        exportedAt: new Date().toISOString(),
        format,
        count: logs.length
      },
      data: logs
    });
    return;
  } catch (error) {
    next(error);
  }
}

// Apply authentication middleware to all audit routes
router.use(tenantExtractorMiddleware);

// Routes
router.get('/logs', getAuditLogs);
router.get('/logs/:id', getAuditLogEntry);
router.get('/verify', verifyAuditChainEndpoint);
router.get('/export', exportAuditLogs);

export default router;
