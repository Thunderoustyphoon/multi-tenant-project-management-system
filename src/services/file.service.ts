/**
 * File Upload Service
 * Handles file uploads with validation and metadata tracking
 * Uses local filesystem or S3 (configured via env)
 */

import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { createAuditLog } from '../utils/audit.utils';
import { NotFoundError, ValidationError } from '../middlewares/error.middleware';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800'); // 50MB default

export class FileUploadService {
  /**
   * Validate file size
   */
  static validateFileSize(fileSize: number): void {
    if (fileSize > MAX_FILE_SIZE) {
      throw new ValidationError('File too large', [
        {
          code: 'file_too_large',
          message: `File must be smaller than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          path: ['file'],
        },
      ]);
    }
  }

  /**
   * Validate file type (MIME type)
   */
  static validateFileType(mimeType: string): void {
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

    if (!allowedTypes.includes(mimeType)) {
      throw new ValidationError('File type not allowed', [
        {
          code: 'file_type_not_allowed',
          message: `Allowed types: ${allowedTypes.join(', ')}`,
          path: ['file'],
        },
      ]);
    }
  }

  /**
   * Upload file and store metadata
   */
  static async uploadFile(
    tenantId: string,
    userId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }
  ) {
    // Validate
    this.validateFileSize(file.size);
    this.validateFileType(file.mimetype);

    // Generate safe filename
    const fileExtension = path.extname(file.originalname);
    const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, tenantId, fileName);

    // Ensure directory exists
    await fsp.mkdir(path.dirname(filePath), { recursive: true });

    // Save file
    await fsp.writeFile(filePath, file.buffer);

    // Store metadata in database
    const fileRecord = await prisma.file.create({
      data: {
        tenantId,
        filename: file.originalname,
        url: `/files/${tenantId}/${fileName}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId,
      },
    });

    // Audit log
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'FILE_UPLOADED',
      resourceType: 'File',
      resourceId: fileRecord.id,
      newValue: {
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      },
    });

    return fileRecord;
  }

  /**
   * Get file metadata
   */
  static async getFile(tenantId: string, fileId: string, userId: string) {
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Audit log for access
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'FILE_ACCESSED',
      resourceType: 'File',
      resourceId: fileId,
    });

    return file;
  }

  /**
   * List files uploaded by user
   */
  static async listFiles(tenantId: string, userId: string, limit: number = 20, cursor?: string) {
    const files = await prisma.file.findMany({
      where: {
        tenantId,
        uploadedBy: userId,
      },
      cursor: cursor ? { id: cursor } : undefined,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasMore = files.length > limit;
    const items = files.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Delete file
   */
  static async deleteFile(tenantId: string, fileId: string, userId: string) {
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Only allow deleting own files (in production, add admin override)
    if (file.uploadedBy !== userId) {
      throw new NotFoundError('File not found');
    }

    // Delete from filesystem
    const filePath = path.join(UPLOAD_DIR, tenantId, path.basename(file.url));
    try {
      await fsp.unlink(filePath);
    } catch (err) {
      // File may not exist on disk, continue
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: fileId },
    });

    // Audit log
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'FILE_DELETED',
      resourceType: 'File',
      resourceId: fileId,
      oldValue: { filename: file.filename },
    });
  }

  /**
   * Get file for download
   */
  static async downloadFile(tenantId: string, fileId: string, userId: string) {
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    const filePath = path.join(UPLOAD_DIR, tenantId, path.basename(file.url));

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('File not found on disk');
    }

    // Audit log
    await createAuditLog(prisma, {
      tenantId,
      userId,
      action: 'FILE_DOWNLOADED',
      resourceType: 'File',
      resourceId: fileId,
    });

    return {
      path: filePath,
      filename: file.filename,
      mimeType: file.mimeType,
    };
  }
}
