import { z } from 'zod';

/**
 * Create Task Schema
 * Tasks are scoped to projects within workspaces
 */
export const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in-progress', 'completed']).default('todo'),
});

/**
 * Update Task Schema
 */
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in-progress', 'completed']).optional(),
});

/**
 * Assign Task Schema
 */
export const assignTaskSchema = z.object({
  assignedToId: z.string().cuid().nullable().optional(),
});

/**
 * List Tasks Query Schema
 */
export const listTasksSchema = z.object({
  status: z.enum(['todo', 'in-progress', 'completed']).optional(),
  assignedToId: z.string().cuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
