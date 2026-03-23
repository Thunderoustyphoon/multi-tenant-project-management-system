import { Router } from 'express';
import multer from 'multer';
import * as fileController from './file.controller';
import { extractTenantFromApiKey } from '../../middlewares/tenantExtractor.middleware';
import { rateLimitMiddleware } from '../../middlewares/rateLimit.middleware';

const router = Router();

// Configure multer for file uploads (50MB max by default)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
  },
  fileFilter: (req: any, file: { mimetype: string }, cb: (error: Error | null, accept?: boolean) => void) => {
    // Validate file type on upload
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

/**
 * POST /api/files
 * Upload file
 * 
 * @openapi
 * /files:
 *   post:
 *     tags: [Files]
 *     summary: Upload file
 *     description: Upload file (max 50MB, supported types)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File uploaded
 *       400:
 *         description: Invalid file
 *       413:
 *         description: File too large
 */
router.post(
  '/',
  extractTenantFromApiKey,
  rateLimitMiddleware,
  upload.single('file'),
  fileController.uploadFile
);

/**
 * GET /api/files
 * List uploaded files
 * 
 * @openapi
 * /files:
 *   get:
 *     tags: [Files]
 *     summary: List files
 *     description: List user's uploaded files with cursor pagination
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: cursor
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File list
 */
router.get('/', extractTenantFromApiKey, rateLimitMiddleware, fileController.listFiles);

/**
 * GET /api/files/:fileId
 * Get file metadata
 * 
 * @openapi
 * /files/{fileId}:
 *   get:
 *     tags: [Files]
 *     summary: Get file
 *     description: Get file metadata and info
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File metadata
 *       404:
 *         description: File not found
 */
router.get('/:fileId', extractTenantFromApiKey, rateLimitMiddleware, fileController.getFile);

/**
 * GET /api/files/:fileId/download
 * Download file
 * 
 * @openapi
 * /files/{fileId}/download:
 *   get:
 *     tags: [Files]
 *     summary: Download file
 *     description: Download file with original filename
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File content
 *       404:
 *         description: File not found
 */
router.get('/:fileId/download', extractTenantFromApiKey, rateLimitMiddleware, fileController.downloadFile);

/**
 * DELETE /api/files/:fileId
 * Delete file
 * 
 * @openapi
 * /files/{fileId}:
 *   delete:
 *     tags: [Files]
 *     summary: Delete file
 *     description: Delete file permanently (owner only)
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 *       404:
 *         description: File not found
 */
router.delete('/:fileId', extractTenantFromApiKey, rateLimitMiddleware, fileController.deleteFile);

export default router;
