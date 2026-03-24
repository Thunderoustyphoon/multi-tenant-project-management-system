import { z } from 'zod';

/**
 * Create Workspace Schema
 * Workspace subdivisions within a tenant with owner-member isolation
 */
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

/**
 * Update Workspace Schema
 */
export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
});

/**
 * Add Member to Workspace Schema
 */
export const addWorkspaceMemberSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(['owner', 'member']).default('member'),
});

/**
 * Update Member Role Schema
 */
export const updateWorkspaceMemberSchema = z.object({
  role: z.enum(['owner', 'member']),
});

/**
 * List Workspaces Query Schema
 */
export const listWorkspacesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type AddWorkspaceMemberInput = z.infer<typeof addWorkspaceMemberSchema>;
export type UpdateWorkspaceMemberInput = z.infer<typeof updateWorkspaceMemberSchema>;
export type ListWorkspacesInput = z.infer<typeof listWorkspacesSchema>;
