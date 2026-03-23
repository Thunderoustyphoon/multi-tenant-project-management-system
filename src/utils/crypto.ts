import crypto from 'crypto';
import argon2 from 'argon2';

const PREFIX = 'vz_'; // Velozity prefix
const KEY_LENGTH = 32;

/**
 * Generate a new API key in format: vz_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * This is the raw key that is shown to the user ONLY ONCE
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(KEY_LENGTH).toString('hex');
  return `${PREFIX}${randomBytes}`;
}

/**
 * Hash an API key using Argon2 for storage in database
 * The raw key is never stored - only the hash
 */
export async function hashApiKey(key: string): Promise<string> {
  return argon2.hash(key, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1
  });
}

/**
 * Verify an API key against its hash
 */
export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, key);
  } catch (err) {
    return false;
  }
}

/**
 * Generate SHA-256 hash for audit chain
 * Used for creating tamper-evident audit logs
 */
export function generateSHA256Hash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a cursor for pagination (base64 encoded)
 */
export function generateCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

/**
 * Decode a cursor from pagination
 */
export function decodeCursor(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch (err) {
    return null;
  }
}
