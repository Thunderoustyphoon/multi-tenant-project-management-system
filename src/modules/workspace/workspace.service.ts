import prisma from '../../config/prisma';
import type { PrismaClient, Prisma } from '@prisma/client';
import { createAuditLog } from '../../utils/audit.utils';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middlewares/error.middleware';
import { EmailService } from '../../services/email.service';
import logger from '../../utils/logger';
import type { CreateWorkspaceInput, UpdateWorkspaceInput, AddWorkspaceMemberInput, UpdateWorkspaceMemberInput } from './workspace.validation';

export class WorkspaceService {
  /**
   * Create new workspace within tenant
   * Creator automatically becomes owner
   */
  static async createWorkspace(tenantId: string, userId: string, data: CreateWorkspaceInput) {

    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        tenantId,
        name: data.name,
      },
    });

    if (existingWorkspace) {
      throw new ConflictError('Workspace name already exists in this tenant');
    }


    const workspace = await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const ws = await tx.workspace.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description,
          ownerId: userId,
        },
      });


      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId,
          role: 'owner',
        },
      });


      await createAuditLog(tx, {
        tenantId,
        userId,
        action: 'WORKSPACE_CREATED',
        resourceType: 'Workspace',
        resourceId: ws.id,
        newValue: {
          workspaceId: ws.id,
          workspaceName: ws.name,
        },
      });

      return ws;
    });

    return workspace;
  }

  /**
   * Get workspace with member info
   */
  static async getWorkspace(tenantId: string, workspaceId: string, userId: string) {

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

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        projects: {
          where: { status: 'active' },
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
    });

    if (!workspace || workspace.tenantId !== tenantId) {
      throw new NotFoundError('Workspace not found');
    }

    return workspace;
  }

  /**
   * List workspaces for user within tenant
   */
  static async listWorkspaces(tenantId: string, userId: string, cursor?: string, limit: number = 20) {
    const workspaces = await prisma.workspace.findMany({
      where: {
        tenantId,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          select: { userId: true, role: true },
        },
        _count: {
          select: { projects: true, members: true },
        },
      },
      cursor: cursor ? { id: cursor } : undefined,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasMore = workspaces.length > limit;
    const items = workspaces.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Update workspace details (owner-only)
   */
  static async updateWorkspace(
    tenantId: string,
    workspaceId: string,
    userId: string,
    data: UpdateWorkspaceInput
  ) {

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member || member.role !== 'owner') {
      throw new ForbiddenError('Only workspace owners can update workspace details');
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data,
    });


    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'WORKSPACE_UPDATED',
      resourceType: 'Workspace',
      resourceId: workspaceId,
      newValue: data as Prisma.InputJsonValue,
    });

    return workspace;
  }

  /**
   * Archive workspace (owner-only)
   */
  static async archiveWorkspace(tenantId: string, workspaceId: string, userId: string) {

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member || member.role !== 'owner') {
      throw new ForbiddenError('Only workspace owners can archive workspace');
    }


    await prisma.project.updateMany({
      where: { workspaceId },
      data: { status: 'archived' },
    });


    const currentWorkspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true }
    });

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { 
        name: `[ARCHIVED] ${currentWorkspace?.name || workspaceId}`,
      },
    });


    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'WORKSPACE_ARCHIVED',
      resourceType: 'Workspace',
      resourceId: workspaceId,
    });

    return workspace;
  }

  /**
   * Add member to workspace (owner-only)
   * Also sends invite email per spec
   */
  static async addMember(
    tenantId: string,
    workspaceId: string,
    userId: string,
    data: AddWorkspaceMemberInput
  ) {
    // Check actor is owner
    const actorMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!actorMember || actorMember.role !== 'owner') {
      throw new ForbiddenError('Only workspace owners can add members');
    }

    // Verify user exists in tenant
    const targetUser = await prisma.user.findFirst({
      where: {
        id: data.userId,
        tenantId,
      },
    });

    if (!targetUser) {
      throw new NotFoundError('User not found in this tenant');
    }

    // Check if already member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: data.userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictError('User is already a member of this workspace');
    }

    // Get workspace name for email
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: data.userId,
        role: data.role,
      },
      include: {
        user: {
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
      action: 'WORKSPACE_MEMBER_ADDED',
      resourceType: 'WorkspaceMember',
      resourceId: member.id,
      newValue: {
        workspaceId,
        newMemberId: data.userId,
        role: data.role,
      },
    });

    // Send invite email per spec — "New user invited to tenant"
    try {
      await EmailService.sendInviteEmail(
        tenantId,
        targetUser.email,
        targetUser.name,
        workspace?.name || 'Workspace'
      );
    } catch (err) {
      // Don't fail the add operation if email fails — it will be retried via queue
      logger.error('Failed to queue invite email', err);
    }

    return member;
  }

  /**
   * Remove member from workspace (owner-only, prevent removing last owner)
   */
  static async removeMember(tenantId: string, workspaceId: string, userId: string, memberUserId: string) {
    // Check actor is owner
    const actorMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!actorMember || actorMember.role !== 'owner') {
      throw new ForbiddenError('Only workspace owners can remove members');
    }

    // Check target member exists
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundError('Member not found in this workspace');
    }

    // Prevent removing last owner
    if (targetMember.role === 'owner') {
      const ownerCount = await prisma.workspaceMember.count({
        where: {
          workspaceId,
          role: 'owner',
        },
      });

      if (ownerCount === 1) {
        throw new ConflictError('Cannot remove the last owner of the workspace');
      }
    }

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    // Audit log — correct signature
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'WORKSPACE_MEMBER_REMOVED',
      resourceType: 'WorkspaceMember',
      resourceId: targetMember.id,
      oldValue: {
        workspaceId,
        removedMemberId: memberUserId,
      },
    });
  }

  /**
   * Update member role (owner-only, prevent removing last owner)
   */
  static async updateMemberRole(
    tenantId: string,
    workspaceId: string,
    userId: string,
    memberUserId: string,
    newRole: string
  ) {
    // Check actor is owner
    const actorMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!actorMember || actorMember.role !== 'owner') {
      throw new ForbiddenError('Only workspace owners can update member roles');
    }

    // Check target member exists
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundError('Member not found in this workspace');
    }

    // Prevent demoting last owner
    if (targetMember.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await prisma.workspaceMember.count({
        where: {
          workspaceId,
          role: 'owner',
        },
      });

      if (ownerCount === 1) {
        throw new ConflictError('Cannot demote the last owner of the workspace');
      }
    }

    const member = await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
      data: {
        role: newRole,
      },
      include: {
        user: {
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
      action: 'WORKSPACE_MEMBER_UPDATED',
      resourceType: 'WorkspaceMember',
      resourceId: targetMember.id,
      oldValue: { role: targetMember.role },
      newValue: { role: newRole },
    });

    return member;
  }

  /**
   * Get all members in workspace
   */
  static async getMembers(tenantId: string, workspaceId: string, userId: string) {
    // Check user has access to workspace
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

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return members;
  }
}
