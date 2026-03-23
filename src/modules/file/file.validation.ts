import { z } from 'zod';

/**
 * Delete File Schema
 */
export const deleteFileSchema = z.object({
  fileId: z.string().cuid(),
});

export type DeleteFileInput = z.infer<typeof deleteFileSchema>;
