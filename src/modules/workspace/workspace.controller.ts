import { Request, Response, NextFunction } from 'express';
import { WorkspaceService } from './workspace.service';
import { createWorkspaceSchema, updateWorkspaceSchema, addWorkspaceMemberSchema, updateWorkspaceMemberSchema, listWorkspacesSchema } from './workspace.validation';
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
 * Create new workspace
 */
export async function createWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = createWorkspaceSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid workspace data', validation.error.issues);
    }

    const workspace = await WorkspaceService.createWorkspace(
      req.tenant!.id,
      req.user!.id,
      validation.data
    );

    res.status(201).json({
      data: workspace,
      message: 'Workspace created successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get workspace details
 */
export async function getWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspace = await WorkspaceService.getWorkspace(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id
    );

    res.json({
      data: workspace,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List workspaces for authenticated user
 */
export async function listWorkspaces(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = listWorkspacesSchema.safeParse(req.query);
    if (!validation.success) {
      throw new ValidationError('Invalid query parameters', validation.error.issues);
    }

    const result = await WorkspaceService.listWorkspaces(
      req.tenant!.id,
      req.user!.id,
      validation.data.cursor,
      validation.data.limit
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
 * Update workspace details (owner-only)
 */
export async function updateWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = updateWorkspaceSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid workspace data', validation.error.issues);
    }

    const workspace = await WorkspaceService.updateWorkspace(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id,
      validation.data
    );

    res.json({
      data: workspace,
      message: 'Workspace updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Archive workspace (owner-only)
 */
export async function archiveWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await WorkspaceService.archiveWorkspace(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id
    );

    res.json({
      message: 'Workspace archived successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add member to workspace (owner-only)
 */
export async function addMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = addWorkspaceMemberSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid member data', validation.error.issues);
    }

    const member = await WorkspaceService.addMember(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id,
      validation.data
    );

    res.status(201).json({
      data: member,
      message: 'Member added to workspace',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove member from workspace (owner-only)
 */
export async function removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await WorkspaceService.removeMember(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id,
      req.params.userId
    );

    res.json({
      message: 'Member removed from workspace',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update member role (owner-only)
 */
export async function updateMemberRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = updateWorkspaceMemberSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid role data', validation.error.issues);
    }

    const member = await WorkspaceService.updateMemberRole(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id,
      req.params.userId,
      validation.data.role
    );

    res.json({
      data: member,
      message: 'Member role updated',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all members in workspace
 */
export async function getMembers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const members = await WorkspaceService.getMembers(
      req.tenant!.id,
      req.params.workspaceId,
      req.user!.id
    );

    res.json({
      data: members,
    });
  } catch (error) {
    next(error);
  }
}
