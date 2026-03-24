import { Request, Response, NextFunction } from 'express';
import { FileUploadService } from '../../services/file.service';
import { ValidationError, NotFoundError } from '../../middlewares/error.middleware';

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
 * Upload file
 */
export async function uploadFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new ValidationError('No file provided', [
        {
          code: 'file_required',
          message: 'File is required',
          path: ['file'],
        },
      ]);
    }

    const file = await FileUploadService.uploadFile(
      req.tenant!.id,
      req.user!.id,
      req.file
    );

    res.status(201).json({
      data: file,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List uploaded files
 */
export async function listFiles(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(parseInt(String(req.query.limit)) || 20, 100);
    const cursor = (req.query.cursor as string) || undefined;

    const result = await FileUploadService.listFiles(
      req.tenant!.id,
      req.user!.id,
      limit,
      cursor
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
 * Get file metadata
 */
export async function getFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await FileUploadService.getFile(
      req.tenant!.id,
      req.params.fileId,
      req.user!.id
    );

    res.json({
      data: file,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete file
 */
export async function deleteFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await FileUploadService.deleteFile(
      req.tenant!.id,
      req.params.fileId,
      req.user!.id
    );

    res.json({
      message: 'File deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Download file
 */
export async function downloadFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await FileUploadService.downloadFile(
      req.tenant!.id,
      req.params.fileId,
      req.user!.id
    );

    res.download(file.path, file.filename, (err: any) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
}
