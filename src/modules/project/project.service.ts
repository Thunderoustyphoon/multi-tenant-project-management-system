import prisma from '../../config/prisma';
import { createAuditLog } from '../../utils/audit.utils';
import { NotFoundError, ForbiddenError, ConflictError } from '../../middlewares/error.middleware';
import { CreateProjectInput, UpdateProjectInput, AddProjectMemberInput, UpdateProjectMemberInput } from './project.validation';

/**
 * Project Service
 * Handles all project-related business logic
 * Per spec: Projects are isolated per tenant
 */
export class ProjectService {
  /**
   * Create a new project in a tenant
   * User making request must be owner or member with create permission
   */
  static async createProject(
    tenantId: string,
    userId: string,
    input: CreateProjectInput
  ) {
    const project = await prisma.project.create({
      data: {
        tenantId,
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        color: input.color,
        isPublic: input.isPublic,
        createdBy: userId
      },
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            user: { select: { name: true, email: true } }
          }
        }
      }
    });

    // Add creator as project owner — without this, permission checks
    // (updateProject, deleteProject, addMember) would fail for the creator
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId,
        role: 'owner',
      },
    });

    // Re-fetch with members included
    const projectWithMembers = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            user: { select: { name: true, email: true } }
          }
        }
      }
    });


    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'PROJECT_CREATED',
      resourceType: 'Project',
      resourceId: project.id,
      newValue: {
        name: project.name,
        isPublic: project.isPublic
      }
    });

    return projectWithMembers || project;
  }

  /**
   * Get project by ID with permission check
   */
  static async getProject(tenantId: string, projectId: string, userId?: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        tenantId
      },
      include: {
        members: {
          select: {
            userId: true,
            role: true,
            user: { select: { name: true, email: true } }
          }
        },
        _count: {
          select: { tasks: true }
        }
      }
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }


    if (userId && !project.isPublic) {
      const isMember = project.members.some((m: { userId: string; role: string }) => m.userId === userId);
      if (!isMember) {
        throw new ForbiddenError('You do not have access to this project');
      }
    }

    return project;
  }

  /**
   * List projects for a tenant with cursor pagination
   */
  static async listProjects(
    tenantId: string,
    userId: string,
    options?: {
      cursor?: string;
      limit?: number;
      archived?: boolean;
    }
  ) {
    const limit = Math.min(options?.limit || 20, 100);


    let cursorFilter: Record<string, unknown> | undefined;
    if (options?.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(options.cursor, 'base64').toString());
        cursorFilter = {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            {
              AND: [
                { createdAt: { equals: decoded.createdAt } },
                { id: { lt: decoded.id } }
              ]
            }
          ]
        };
      } catch (err) {
        // Invalid cursor, ignore
      }
    }


    const projects = await prisma.project.findMany({
      where: {
        tenantId,
        isArchived: options?.archived || false,
        OR: [
          { isPublic: true },
          {
            members: {
              some: { userId }
            }
          }
        ],
        ...(cursorFilter && { AND: [cursorFilter] })
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ],
      take: limit + 1,
      include: {
        _count: { select: { tasks: true, members: true } }
      }
    });

    const hasMore = projects.length > limit;
    const data = hasMore ? projects.slice(0, limit) : projects;

    let nextCursor: string | undefined;
    if (hasMore && data.length > 0) {
      const lastProject = data[data.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: lastProject.createdAt.toISOString(),
          id: lastProject.id
        })
      ).toString('base64');
    }

    return {
      projects: data,
      nextCursor,
      hasMore
    };
  }

  /**
   * Update project
   * Only project owner can update
   */
  static async updateProject(
    tenantId: string,
    projectId: string,
    userId: string,
    input: UpdateProjectInput
  ) {
    const project = await this.getProject(tenantId, projectId, userId);

    // Check permission: must be owner
    const userRole = project.members.find((m: { userId: string; role: string }) => m.userId === userId)?.role;
    if (userRole !== 'owner') {
      throw new ForbiddenError('Only project owners can update project details');
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: input.name,
        description: input.description,
        color: input.color,
        isPublic: input.isPublic
      }
    });

    // Log update
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'PROJECT_UPDATED',
      resourceType: 'Project',
      resourceId: projectId,
      oldValue: {
        name: project.name,
        isPublic: project.isPublic
      },
      newValue: {
        name: updated.name,
        isPublic: updated.isPublic
      }
    });

    return updated;
  }

  /**
   * Archive project
   * Only project owner can archive
   */
  static async archiveProject(tenantId: string, projectId: string, userId: string) {
    const project = await this.getProject(tenantId, projectId, userId);

    const userRole = project.members.find((m: { userId: string; role: string }) => m.userId === userId)?.role;
    if (userRole !== 'owner') {
      throw new ForbiddenError('Only project owners can archive projects');
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true }
    });

    // Log archival
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'PROJECT_ARCHIVED',
      resourceType: 'Project',
      resourceId: projectId,
      newValue: { isArchived: true }
    });

    return updated;
  }

  /**
   * Delete project (soft delete via archival)
   */
  static async deleteProject(tenantId: string, projectId: string, userId: string) {
    return this.archiveProject(tenantId, projectId, userId);
  }

  /**
   * Add member to project
   * Only project owner can add members
   */
  static async addMember(
    tenantId: string,
    projectId: string,
    userId: string,
    input: AddProjectMemberInput
  ) {
    const project = await this.getProject(tenantId, projectId, userId);

    // Permission check
    const userRole = project.members.find((m: { userId: string; role: string }) => m.userId === userId)?.role;
    if (userRole !== 'owner') {
      throw new ForbiddenError('Only project owners can add members');
    }

    // Check if user already member
    const existingMember = project.members.find((m: { userId: string; role: string }) => m.userId === input.userId);
    if (existingMember) {
      throw new ConflictError('User is already a member of this project');
    }

    // Verify user exists in tenant
    const memberUser = await prisma.user.findFirst({
      where: { id: input.userId, tenantId }
    });

    if (!memberUser) {
      throw new NotFoundError('User not found in this tenant');
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId: input.userId,
        role: input.role
      }
    });

    // Log member addition
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'PROJECT_MEMBER_ADDED',
      resourceType: 'ProjectMember',
      resourceId: member.id,
      newValue: {
        projectId,
        userId: input.userId,
        role: input.role
      }
    });

    return member;
  }

  /**
   * Remove member from project
   * Only project owner can remove members
   */
  static async removeMember(
    tenantId: string,
    projectId: string,
    userId: string,
    memberId: string
  ) {
    const project = await this.getProject(tenantId, projectId, userId);

    // Permission check
    const userRole = project.members.find((m: { userId: string; role: string }) => m.userId === userId)?.role;
    if (userRole !== 'owner') {
      throw new ForbiddenError('Only project owners can remove members');
    }

    const member = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId }
    });

    if (!member) {
      throw new NotFoundError('Project member not found');
    }

    // Cannot remove the last owner
    const ownerCount = project.members.filter((m: { userId: string; role: string }) => m.role === 'owner').length;
    if (member.role === 'owner' && ownerCount === 1) {
      throw new ForbiddenError('Cannot remove the last owner of the project');
    }

    await prisma.projectMember.delete({
      where: { id: memberId }
    });

    // Log member removal
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'PROJECT_MEMBER_REMOVED',
      resourceType: 'ProjectMember',
      resourceId: memberId,
      oldValue: {
        userId: member.userId,
        role: member.role
      }
    });
  }

  /**
   * Update member role
   * Only project owner can update roles
   */
  static async updateMemberRole(
    tenantId: string,
    projectId: string,
    userId: string,
    memberId: string,
    input: UpdateProjectMemberInput
  ) {
    const project = await this.getProject(tenantId, projectId, userId);

    // Permission check
    const userRole = project.members.find((m: { userId: string; role: string }) => m.userId === userId)?.role;
    if (userRole !== 'owner') {
      throw new ForbiddenError('Only project owners can update member roles');
    }

    const member = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId }
    });

    if (!member) {
      throw new NotFoundError('Project member not found');
    }

    // Cannot downgrade last owner
    if (member.role === 'owner' && input.role !== 'owner') {
      const ownerCount = project.members.filter((m: { userId: string; role: string }) => m.role === 'owner').length;
      if (ownerCount === 1) {
        throw new ForbiddenError('Cannot downgrade the last owner');
      }
    }

    const updated = await prisma.projectMember.update({
      where: { id: memberId },
      data: { role: input.role }
    });

    // Log role update
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'PROJECT_MEMBER_ROLE_UPDATED',
      resourceType: 'ProjectMember',
      resourceId: memberId,
      oldValue: { role: member.role },
      newValue: { role: input.role }
    });

    return updated;
  }

  /**
   * Get project members
   */
  static async getMembers(tenantId: string, projectId: string, userId: string) {
    const project = await this.getProject(tenantId, projectId, userId);

    return project.members;
  }
}
