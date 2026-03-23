import { z } from 'zod';

/**
 * Project validation schemas
 */

export const createProjectSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional().default('#3B82F6'),
  isPublic: z.boolean().optional().default(false)
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  isPublic: z.boolean().optional()
});

export const addProjectMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['owner', 'lead', 'member', 'viewer']).default('member')
});

export const updateProjectMemberSchema = z.object({
  role: z.enum(['owner', 'lead', 'member', 'viewer'])
});

export const projectIdParamSchema = z.object({
  projectId: z.string().min(1)
});

export const projectListQuerySchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
  archived: z.boolean().optional()
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
