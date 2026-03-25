import prisma from '../../config/prisma';
import type { Prisma } from '@prisma/client';
import { createAuditLog } from '../../utils/audit.utils';
import { ForbiddenError, NotFoundError } from '../../middlewares/error.middleware';
import type { CreateTaskInput, UpdateTaskInput, AssignTaskInput } from './task.validation';

export class TaskService {
  /**
   * Verify user has access to project — MUST include tenantId for query-level isolation
   * Spec: "All database queries must be automatically scoped to the resolved tenant"
   */
  private static async verifyProjectAccess(tenantId: string, projectId: string, userId: string): Promise<boolean> {
    // Get project with tenant isolation — findFirst + tenantId, NOT findUnique
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      include: { workspace: true },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId,
        },
      },
    });

    return !!member;
  }

  /**
   * Create new task in project
   */
  static async createTask(tenantId: string, projectId: string, userId: string, data: CreateTaskInput) {
    // Verify access with tenant isolation
    const hasAccess = await this.verifyProjectAccess(tenantId, projectId, userId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }

    const task = await prisma.task.create({
      data: {
        tenantId,
        projectId,
        title: data.title,
        description: data.description,
        status: data.status,
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Audit log — correct signature: createAuditLog(tx, { tenantId, ... })
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'TASK_CREATED',
      resourceType: 'Task',
      resourceId: task.id,
      newValue: {
        taskId: task.id,
        projectId,
        title: task.title,
      },
    });

    return task;
  }

  /**
   * Get task details
   */
  static async getTask(tenantId: string, projectId: string, taskId: string, userId: string) {
    // Verify access with tenant isolation
    const hasAccess = await this.verifyProjectAccess(tenantId, projectId, userId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!task || task.projectId !== projectId) {
      throw new NotFoundError('Task not found');
    }

    return task;
  }

  /**
   * List tasks in project with filtering
   */
  static async listTasks(
    tenantId: string,
    projectId: string,
    userId: string,
    filters?: {
      status?: string;
      assignedToId?: string;
      cursor?: string;
      limit?: number;
    }
  ) {
    // Verify access with tenant isolation
    const hasAccess = await this.verifyProjectAccess(tenantId, projectId, userId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }

    const limit = filters?.limit || 20;

    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        tenantId,
        status: filters?.status ? filters.status : undefined,
        assignedToId: filters?.assignedToId ? filters.assignedToId : undefined,
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      cursor: filters?.cursor ? { id: filters.cursor } : undefined,
      take: limit + 1,
      skip: filters?.cursor ? 1 : 0,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasMore = tasks.length > limit;
    const items = tasks.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Update task
   */
  static async updateTask(
    tenantId: string,
    projectId: string,
    taskId: string,
    userId: string,
    data: UpdateTaskInput
  ) {
    // Verify access with tenant isolation
    const hasAccess = await this.verifyProjectAccess(tenantId, projectId, userId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }

    // Check task exists in project with tenant isolation
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!existingTask || existingTask.projectId !== projectId) {
      throw new NotFoundError('Task not found');
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Audit log — correct signature
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'TASK_UPDATED',
      resourceType: 'Task',
      resourceId: taskId,
      oldValue: {
        title: existingTask.title,
        status: existingTask.status,
      },
      newValue: data as Prisma.InputJsonValue,
    });

    return task;
  }

  /**
   * Assign task to user
   */
  static async assignTask(
    tenantId: string,
    projectId: string,
    taskId: string,
    userId: string,
    data: AssignTaskInput
  ) {
    // Verify access with tenant isolation
    const hasAccess = await this.verifyProjectAccess(tenantId, projectId, userId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }

    // Check task exists in project with tenant isolation
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!existingTask || existingTask.projectId !== projectId) {
      throw new NotFoundError('Task not found');
    }

    // If assigning to someone, verify they're member of workspace
    if (data.assignedToId) {
      // Tenant-scoped lookup — prevents cross-tenant project access
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId },
      });

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      const targetMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: project.workspaceId,
            userId: data.assignedToId,
          },
        },
      });

      if (!targetMember) {
        throw new ForbiddenError('User is not a member of this workspace');
      }
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId: data.assignedToId || null,
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Audit log — correct signature
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'TASK_ASSIGNED',
      resourceType: 'Task',
      resourceId: taskId,
      newValue: {
        assignedTo: data.assignedToId || null,
      },
    });

    return task;
  }

  /**
   * Delete task
   */
  static async deleteTask(tenantId: string, projectId: string, taskId: string, userId: string) {
    // Verify access with tenant isolation
    const hasAccess = await this.verifyProjectAccess(tenantId, projectId, userId);
    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }

    // Check task exists in project with tenant isolation
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });

    if (!existingTask || existingTask.projectId !== projectId) {
      throw new NotFoundError('Task not found');
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    // Audit log — correct signature
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'TASK_DELETED',
      resourceType: 'Task',
      resourceId: taskId,
      oldValue: {
        title: existingTask.title,
        projectId,
      },
    });
  }

  /**
   * Get tasks assigned to user in workspace
   */
  static async getMyTasks(tenantId: string, workspaceId: string, userId: string) {
    // Verify user is member of workspace
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenError('You do not have access to this workspace');
    }

    // Get all tasks assigned to user in projects of this workspace, with tenant isolation
    const tasks = await prisma.task.findMany({
      where: {
        tenantId,
        assignedToId: userId,
        project: {
          workspaceId,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return tasks;
  }
}
