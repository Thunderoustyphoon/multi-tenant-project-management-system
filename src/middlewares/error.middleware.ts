import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';

  constructor(message: string, public details?: Record<string, unknown> | unknown[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  code = 'FORBIDDEN';

  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';

  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  code = 'CONFLICT';

  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends Error {
  statusCode = 429;
  code = 'TOO_MANY_REQUESTS';

  constructor(message = 'Too many requests', public details?: Record<string, unknown>) {
    super(message);
    this.name = 'TooManyRequestsError';
  }
}

export class InternalServerError extends Error {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';

  constructor(message = 'Internal server error') {
    super(message);
    this.name = 'InternalServerError';
  }
}

export function errorHandler(
  err: Error & { statusCode?: number; code?: string; details?: Record<string, unknown>; meta?: { target?: string[] } },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error('Unhandled error', { name: err.name, message: err.message });

  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details: Record<string, unknown> = {};

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = {
      errors: (err as ZodError).issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code
      }))
    };
  }
  // Handle custom errors
  else if (err instanceof ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    details = (Array.isArray(err.details) ? { errors: err.details } : err.details) || {};
  }
  else if (err instanceof UnauthorizedError) {
    statusCode = 401;
    code = 'UNAUTHORIZED';
  }
  else if (err instanceof ForbiddenError) {
    statusCode = 403;
    code = 'FORBIDDEN';
  }
  else if (err instanceof NotFoundError) {
    statusCode = 404;
    code = 'NOT_FOUND';
  }
  else if (err instanceof ConflictError) {
    statusCode = 409;
    code = 'CONFLICT';
  }
  else if (err instanceof TooManyRequestsError) {
    statusCode = 429;
    code = 'TOO_MANY_REQUESTS';
    details = err.details || {};
  }
  // Handle Prisma errors
  else if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Database validation error';
  }
  else if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'CONFLICT';
      message = `Unique constraint failed on field: ${err.meta?.target?.[0] || 'unknown'}`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else {
      statusCode = 400;
      code = 'DATABASE_ERROR';
      message = 'Database error occurred';
    }
  }

  // Response structure per spec: { error: { code, message, details } }
  const response = {
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 && { details })
    }
  };

  res.status(statusCode).json(response);
}
