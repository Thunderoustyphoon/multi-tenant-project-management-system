import { Router } from 'express';
import * as taskController from './task.controller';
import { rateLimitMiddleware } from '../../middlewares/rateLimit.middleware';

const router = Router({ mergeParams: true });

/**
 * POST /api/projects/:projectId/tasks
 * Create new task in project
 * 
 * @openapi
 * /projects/{projectId}/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create task
 *     description: Create new task in project (workspace member)
 *     parameters:
 *       - name: projectId
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
 *               title:
 *                 type: string
 *                 example: "Implement authentication"
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [todo, in-progress, completed]
 *     responses:
 *       201:
 *         description: Task created
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Access denied
 */
router.post('/', rateLimitMiddleware, taskController.createTask);

/**
 * GET /api/projects/:projectId/tasks
 * List tasks in project
 * 
 * @openapi
 * /projects/{projectId}/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks
 *     description: List tasks in project with optional filtering
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [todo, in-progress, completed]
 *       - name: assignedToId
 *         in: query
 *         schema:
 *           type: string
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
 *         description: List of tasks
 *       403:
 *         description: Access denied
 */
router.get('/', rateLimitMiddleware, taskController.listTasks);

/**
 * GET /api/projects/:projectId/tasks/:taskId
 * Get task details
 * 
 * @openapi
 * /projects/{projectId}/tasks/{taskId}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task
 *     description: Get task details including assignee
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task details
 *       403:
 *         description: Access denied
 *       404:
 *         description: Task not found
 */
router.get('/:taskId', rateLimitMiddleware, taskController.getTask);

/**
 * PUT /api/projects/:projectId/tasks/:taskId
 * Update task
 * 
 * @openapi
 * /projects/{projectId}/tasks/{taskId}:
 *   put:
 *     tags: [Tasks]
 *     summary: Update task
 *     description: Update task title, description, or status
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [todo, in-progress, completed]
 *     responses:
 *       200:
 *         description: Task updated
 *       403:
 *         description: Access denied
 *       404:
 *         description: Task not found
 */
router.put('/:taskId', rateLimitMiddleware, taskController.updateTask);

/**
 * POST /api/projects/:projectId/tasks/:taskId/assign
 * Assign task to user
 * 
 * @openapi
 * /projects/{projectId}/tasks/{taskId}/assign:
 *   post:
 *     tags: [Tasks]
 *     summary: Assign task
 *     description: Assign or unassign task to/from workspace member
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
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
 *               assignedToId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Task assigned
 *       403:
 *         description: Access denied or user not in workspace
 *       404:
 *         description: Task not found
 */
router.post('/:taskId/assign', rateLimitMiddleware, taskController.assignTask);

/**
 * DELETE /api/projects/:projectId/tasks/:taskId
 * Delete task
 * 
 * @openapi
 * /projects/{projectId}/tasks/{taskId}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete task
 *     description: Delete task permanently
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: taskId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted
 *       403:
 *         description: Access denied
 *       404:
 *         description: Task not found
 */
router.delete('/:taskId', rateLimitMiddleware, taskController.deleteTask);

export default router;
