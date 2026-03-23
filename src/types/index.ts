import { Request } from 'express';
import { PrismaClient } from '@prisma/client';

// Tenant type
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

// User type
export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'owner' | 'member'; // Spec defines exactly 2 roles
  isEmailVerified: boolean;
  status: 'active' | 'suspended' | 'invited';
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Key type
export interface ApiKey {
  id: string;
  tenantId: string;
  keyHash: string;
  createdBy: string;
  createdAt: Date;
  rotatedAt?: Date;
  oldKeyHash?: string;
  oldKeyExpiresAt?: Date;
  isActive: boolean;
  lastUsedAt?: Date;
}

// Audit Log type
export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  httpMethod?: string;
  endpoint?: string;
  statusCode?: number;
  previousHash: string;
  currentHash: string;
  createdAt: Date;
}

// Rate Limit Response type
export interface RateLimitResponse {
  error: {
    code: string;
    message: string;
    details: {
      tier: 'global' | 'endpoint' | 'burst';
      limit: number;
      current: number;
      window: string;
      resetInSeconds: number;
    };
  };
}

// Health Check Response
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: { status: string; responseTime: number };
  redis: { status: string; responseTime: number };
  queue: { pending: number; failed: number };
  api: { uptime: number; avgResponseTime: number };
}

// Metrics Response
export interface MetricsResponse {
  period: string;
  totalRequests: number;
  byEndpoint: Record<string, number>;
  rateLimitBreaches: number;
  emailDeliverySuccessRate: number;
}

// Extended Express Request with tenant context
export interface TenantRequest extends Request {
  tenant?: Tenant;
  user?: User;
  apiKey?: ApiKey;
  ipAddress?: string;
  startTime?: number;
}

// API Error structure
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

// Email job type
export interface EmailJob {
  to: string;
  template: string;
  data: Record<string, unknown>;
  tenantId: string;
  userId?: string;
}

// Email template type
export interface EmailTemplate {
  subject: string;
  body: string;
}

// Cursor pagination type
export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}
