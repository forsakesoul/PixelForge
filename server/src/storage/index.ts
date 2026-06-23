import path from 'path';
import { FsStorage } from './fsStorage.js';
import { BlobStorage } from './blobStorage.js';
import type { StorageAdapter } from './types.js';
import { FIVE_MINUTES_MS, FREE_TIER_LIMIT_BYTES, ONE_DAY_MS } from '../utils/ttl.js';

let cached: StorageAdapter | null = null;

export function createStorage(): StorageAdapter {
  if (cached) return cached;

  const driver = (process.env.STORAGE_DRIVER ?? '').toLowerCase();
  const useBlob = driver === 'blob' || (driver === '' && !!process.env.VERCEL);

  if (useBlob) {
    const ttlMs = Number(process.env.FILE_TTL_MS) || FIVE_MINUTES_MS;
    const limitBytes = Number(process.env.QUOTA_LIMIT_BYTES) || FREE_TIER_LIMIT_BYTES;
    cached = new BlobStorage({
      ttlMs,
      limitBytes,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } else {
    const rootDir = process.env.STORAGE_FS_ROOT
      ? path.resolve(process.env.STORAGE_FS_ROOT)
      : process.cwd();
    const ttlMs = Number(process.env.FILE_TTL_MS) || ONE_DAY_MS;
    cached = new FsStorage({ rootDir, ttlMs });
  }

  return cached;
}

export function resetStorageForTest() {
  cached = null;
}

export type { StorageAdapter, StorageObject } from './types.js';
export { STORAGE_KEYS } from './types.js';
