import { Response, NextFunction } from 'express';
import { TenantRequest } from '../../types';
import { ProjectService } from './project.service';
import {
  createProjectSchema,
  updateProjectSchema,
  addProjectMemberSchema,
  updateProjectMemberSchema
} from './project.validation';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../middlewares/error.middleware';
import { createAuditLog } from '../../utils/audit.utils';
import prisma from '../../config/prisma';

/**
 * POST /api/projects
 * Create a new project
 */
export async function createProject(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const validation = createProjectSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid project data', validation.error.issues);
    }

    const project = await ProjectService.createProject(req.tenant.id, req.user?.id || '', validation.data);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/projects
 * List all projects for the tenant
 */
export async function listProjects(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cursor = req.query.cursor as string | undefined;

    const result = await ProjectService.listProjects(req.tenant.id, req.user?.id || '', {
      limit,
      cursor
    });

    res.json({
      success: true,
      message: 'Projects retrieved successfully',
      data: {
        projects: result.projects,
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
 * GET /api/projects/:projectId
 * Get a specific project
 */
export async function getProject(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId } = req.params;

    const project = await ProjectService.getProject(req.tenant.id, projectId, req.user?.id);

    res.json({
      success: true,
      message: 'Project retrieved successfully',
      data: project
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/projects/:projectId
 * Update a project
 */
export async function updateProject(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId } = req.params;
    const validation = updateProjectSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid project data', validation.error.issues);
    }

    const project = await ProjectService.updateProject(
      req.tenant.id,
      projectId,
      req.user?.id || '',
      validation.data
    );

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: project
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/projects/:projectId
 * Archive/delete a project
 */
export async function deleteProject(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId } = req.params;

    const project = await ProjectService.deleteProject(req.tenant.id, projectId, req.user?.id || '');

    res.json({
      success: true,
      message: 'Project archived successfully',
      data: project
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/projects/:projectId/members
 * Get project members
 */
export async function getMembers(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId } = req.params;

    const members = await ProjectService.getMembers(req.tenant.id, projectId, req.user?.id || '');

    res.json({
      success: true,
      message: 'Project members retrieved successfully',
      data: {
        members,
        total: members.length
      }
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/projects/:projectId/members
 * Add a member to project
 */
export async function addMember(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId } = req.params;
    const validation = addProjectMemberSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid member data', validation.error.issues);
    }

    const member = await ProjectService.addMember(
      req.tenant.id,
      projectId,
      req.user?.id || '',
      validation.data
    );

    res.status(201).json({
      success: true,
      message: 'Member added to project successfully',
      data: member
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/projects/:projectId/members/:memberId
 * Remove a member from project
 */
export async function removeMember(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId, memberId } = req.params;

    await ProjectService.removeMember(req.tenant.id, projectId, req.user?.id || '', memberId);

    res.json({
      success: true,
      message: 'Member removed from project successfully'
    });
    return;
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/projects/:projectId/members/:memberId/role
 * Update member role
 */
export async function updateMemberRole(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) {
      throw new UnauthorizedError('Tenant context required');
    }

    const { projectId, memberId } = req.params;
    const validation = updateProjectMemberSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid role data', validation.error.issues);
    }

    const member = await ProjectService.updateMemberRole(
      req.tenant.id,
      projectId,
      req.user?.id || '',
      memberId,
      validation.data
    );

    res.json({
      success: true,
      message: 'Member role updated successfully',
      data: member
    });
    return;
  } catch (error) {
    next(error);
  }
}
