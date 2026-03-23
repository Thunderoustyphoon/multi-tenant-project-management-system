import { Request, Response, NextFunction } from 'express';
import { TaskService } from './task.service';
import { createTaskSchema, updateTaskSchema, assignTaskSchema, listTasksSchema } from './task.validation';
import { ValidationError } from '../../middlewares/error.middleware';

interface AuthenticatedRequest extends Request {
  tenant?: {
    id: string;
    name: string;
  };
  user?: {
    id: string;
    email: string;
  };
}

/**
 * Create new task in project
 */
export async function createTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = createTaskSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid task data', validation.error.issues);
    }

    const task = await TaskService.createTask(
      req.tenant!.id,
      req.params.projectId,
      req.user!.id,
      validation.data
    );

    res.status(201).json({
      data: task,
      message: 'Task created successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get task details
 */
export async function getTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await TaskService.getTask(
      req.tenant!.id,
      req.params.projectId,
      req.params.taskId,
      req.user!.id
    );

    res.json({
      data: task,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List tasks in project with filters
 */
export async function listTasks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = listTasksSchema.safeParse(req.query);
    if (!validation.success) {
      throw new ValidationError('Invalid query parameters', validation.error.issues);
    }

    const result = await TaskService.listTasks(
      req.tenant!.id,
      req.params.projectId,
      req.user!.id,
      validation.data
    );

    res.json({
      data: result.items,
      pagination: {
        cursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update task
 */
export async function updateTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = updateTaskSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid task data', validation.error.issues);
    }

    const task = await TaskService.updateTask(
      req.tenant!.id,
      req.params.projectId,
      req.params.taskId,
      req.user!.id,
      validation.data
    );

    res.json({
      data: task,
      message: 'Task updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Assign task to user
 */
export async function assignTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = assignTaskSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid assignment data', validation.error.issues);
    }

    const task = await TaskService.assignTask(
      req.tenant!.id,
      req.params.projectId,
      req.params.taskId,
      req.user!.id,
      validation.data
    );

    res.json({
      data: task,
      message: 'Task assigned successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete task
 */
export async function deleteTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await TaskService.deleteTask(
      req.tenant!.id,
      req.params.projectId,
      req.params.taskId,
      req.user!.id
    );

    res.json({
      message: 'Task deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get tasks assigned to current user in workspace
 */
export async function getMyTasks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tasks = await TaskService.getMyTasks(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id
    );

    res.json({
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
}
