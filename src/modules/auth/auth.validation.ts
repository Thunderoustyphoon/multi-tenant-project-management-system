import { z } from 'zod';

// Register validation
export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(1, 'Name is required').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[!@#$%^&*]/, 'Password must contain special character'),
  tenantName: z.string().min(1, 'Tenant name is required').max(255),
  tenantSlug: z
    .string()
    .min(1, 'Tenant slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Login validation (not used with API keys, but kept for reference)
export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Invalid credentials')
});

export type LoginInput = z.infer<typeof loginSchema>;

// API Key rotation validation
export const rotateApiKeySchema = z.object({
  reason: z.string().max(255).optional(),
});

export type RotateApiKeyInput = z.infer<typeof rotateApiKeySchema>;

// API Key creation validation
export const createApiKeySchema = z.object({
  name: z.string().optional().describe('Optional name for tracking API keys')
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
