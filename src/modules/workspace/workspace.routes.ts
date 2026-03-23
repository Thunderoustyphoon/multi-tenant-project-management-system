import { Router } from 'express';
import * as workspaceController from './workspace.controller';
import { extractTenantFromApiKey } from '../../middlewares/tenantExtractor.middleware';
import { rateLimitMiddleware } from '../../middlewares/rateLimit.middleware';

const router = Router();

/**
 * POST /api/workspaces
 * Create new workspace within tenant
 * 
 * @openapi
 * /workspaces:
 *   post:
 *     tags: [Workspaces]
 *     summary: Create workspace
 *     description: Create a new workspace within tenant. Creator becomes owner.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Engineering Team"
 *               description:
 *                 type: string
 *                 example: "Internal engineering operations"
 *     responses:
 *       201:
 *         description: Workspace created
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Workspace name already exists
 */
router.post('/', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.createWorkspace);

/**
 * GET /api/workspaces
 * List workspaces accessible to authenticated user
 * 
 * @openapi
 * /workspaces:
 *   get:
 *     tags: [Workspaces]
 *     summary: List workspaces
 *     description: Get all workspaces user is member of with cursor pagination
 *     parameters:
 *       - name: cursor
 *         in: query
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of workspaces
 */
router.get('/', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.listWorkspaces);

/**
 * GET /api/workspaces/:workspaceId
 * Get workspace details with members
 * 
 * @openapi
 * /workspaces/{workspaceId}:
 *   get:
 *     tags: [Workspaces]
 *     summary: Get workspace
 *     description: Get workspace details including member list and active projects
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workspace details
 *       403:
 *         description: Access denied
 *       404:
 *         description: Workspace not found
 */
router.get('/:workspaceId', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.getWorkspace);

/**
 * PUT /api/workspaces/:workspaceId
 * Update workspace details (owner-only)
 * 
 * @openapi
 * /workspaces/{workspaceId}:
 *   put:
 *     tags: [Workspaces]
 *     summary: Update workspace
 *     description: Update workspace name and description (owner-only)
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Workspace updated
 *       403:
 *         description: Only owners can update
 *       404:
 *         description: Workspace not found
 */
router.put('/:workspaceId', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.updateWorkspace);

/**
 * DELETE /api/workspaces/:workspaceId
 * Archive workspace and all its projects (owner-only)
 * 
 * @openapi
 * /workspaces/{workspaceId}:
 *   delete:
 *     tags: [Workspaces]
 *     summary: Archive workspace
 *     description: Archive workspace (owner-only). Archives all projects within.
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workspace archived
 *       403:
 *         description: Only owners can archive
 *       404:
 *         description: Workspace not found
 */
router.delete('/:workspaceId', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.archiveWorkspace);

/**
 * GET /api/workspaces/:workspaceId/members
 * Get all members in workspace
 * 
 * @openapi
 * /workspaces/{workspaceId}/members:
 *   get:
 *     tags: [Workspaces, Members]
 *     summary: Get workspace members
 *     description: List all members in workspace with roles
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member list
 *       403:
 *         description: Access denied
 */
router.get('/:workspaceId/members', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.getMembers);

/**
 * POST /api/workspaces/:workspaceId/members
 * Add member to workspace (owner-only)
 * 
 * @openapi
 * /workspaces/{workspaceId}/members:
 *   post:
 *     tags: [Workspaces, Members]
 *     summary: Add member
 *     description: Add user to workspace with specified role (owner-only)
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [owner, member]
 *     responses:
 *       201:
 *         description: Member added
 *       403:
 *         description: Only owners can add members
 *       404:
 *         description: User not found
 *       409:
 *         description: User already member
 */
router.post('/:workspaceId/members', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.addMember);

/**
 * PUT /api/workspaces/:workspaceId/members/:userId
 * Update member role (owner-only)
 * 
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}:
 *   put:
 *     tags: [Workspaces, Members]
 *     summary: Update member role
 *     description: Change member's role in workspace (owner-only, cannot demote last owner)
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [owner, member]
 *     responses:
 *       200:
 *         description: Role updated
 *       403:
 *         description: Only owners can update roles
 *       404:
 *         description: Member not found
 *       409:
 *         description: Cannot demote last owner
 */
router.put('/:workspaceId/members/:userId', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.updateMemberRole);

/**
 * DELETE /api/workspaces/:workspaceId/members/:userId
 * Remove member from workspace (owner-only)
 * 
 * @openapi
 * /workspaces/{workspaceId}/members/{userId}:
 *   delete:
 *     tags: [Workspaces, Members]
 *     summary: Remove member
 *     description: Remove user from workspace (owner-only, cannot remove last owner)
 *     parameters:
 *       - name: workspaceId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 *       403:
 *         description: Only owners can remove members
 *       404:
 *         description: Member not found
 *       409:
 *         description: Cannot remove last owner
 */
router.delete('/:workspaceId/members/:userId', extractTenantFromApiKey, rateLimitMiddleware, workspaceController.removeMember);

export default router;
