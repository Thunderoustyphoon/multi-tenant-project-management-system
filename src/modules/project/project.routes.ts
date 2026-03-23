import { Router } from 'express';
import * as projectController from './project.controller';
import { tenantExtractorMiddleware } from '../../middlewares/tenantExtractor.middleware';
import taskRoutes from '../task/task.routes';

const router = Router({ mergeParams: true });

/**
 * POST /api/projects
 * Create a new project
 * Authentication: Required - Bearer <api_key>
 * 
 * Request body:
 * {
 *   "name": "New Project",
 *   "description": "Project description",
 *   "color": "#3B82F6",
 *   "isPublic": false
 * }
 */
router.post('/', tenantExtractorMiddleware, projectController.createProject);

/**
 * GET /api/projects
 * List all projects
 * Query params: limit, cursor
 */
router.get('/', tenantExtractorMiddleware, projectController.listProjects);

/**
 * GET /api/projects/:projectId
 * Get a specific project
 */
router.get('/:projectId', tenantExtractorMiddleware, projectController.getProject);

/**
 * PUT /api/projects/:projectId
 * Update project
 * Only project owners can update
 */
router.put('/:projectId', tenantExtractorMiddleware, projectController.updateProject);

/**
 * DELETE /api/projects/:projectId
 * Archive/delete project
 * Only project owners can delete
 */
router.delete('/:projectId', tenantExtractorMiddleware, projectController.deleteProject);

/**
 * GET /api/projects/:projectId/members
 * Get project members
 */
router.get('/:projectId/members', tenantExtractorMiddleware, projectController.getMembers);

/**
 * POST /api/projects/:projectId/members
 * Add a member to project
 * Only project owners can add members
 */
router.post('/:projectId/members', tenantExtractorMiddleware, projectController.addMember);

/**
 * DELETE /api/projects/:projectId/members/:memberId
 * Remove a member from project
 * Only project owners can remove members
 */
router.delete('/:projectId/members/:memberId', tenantExtractorMiddleware, projectController.removeMember);

/**
 * PUT /api/projects/:projectId/members/:memberId/role
 * Update member role
 * Only project owners can update roles
 */
router.put('/:projectId/members/:memberId/role', tenantExtractorMiddleware, projectController.updateMemberRole);

// Task routes: /api/projects/:projectId/tasks/*
router.use('/:projectId/tasks', taskRoutes);

export default router;
