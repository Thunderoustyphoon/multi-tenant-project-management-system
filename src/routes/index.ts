import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import auditRoutes from '../modules/audit/audit.routes';
import projectRoutes from '../modules/project/project.routes';
import workspaceRoutes from '../modules/workspace/workspace.routes';
import fileRoutes from '../modules/file/file.routes';
import healthRoutes from './health.routes';

const router = Router();

/**
 * API Routes Aggregator
 * All routes are prefixed with /api in server.ts
 */

// Health & Metrics routes: /api/health, /api/metrics, /api/status
router.use('/', healthRoutes);

// Authentication routes: /api/auth/*
router.use('/auth', authRoutes);

// Audit routes: /api/audit/*
router.use('/audit', auditRoutes);

// Project routes: /api/projects/*
router.use('/projects', projectRoutes);

// Workspace routes: /api/workspaces/*
router.use('/workspaces', workspaceRoutes);

// File routes: /api/files/*
router.use('/files', fileRoutes);

// TODO: Task routes - /api/tasks/*
// router.use('/tasks', taskRoutes);

export default router;
