import { Router } from 'express';
import type { ApiResponse, QuotaResponse } from '../../../shared/types.js';
import { createStorage } from '../storage/index.js';

export const quotaRouter = Router();

// 简单的进程内缓存（单实例 30s），减少 list() 调用
let cache: { value: number; at: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

async function getCachedUsedBytes(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  const storage = createStorage();
  const value = await storage.usedBytes();
  cache = { value, at: now };
  return value;
}

export function invalidateQuotaCache() {
  cache = null;
}

// GET /api/quota?intendedBytes=12345
quotaRouter.get('/quota', async (req, res, next) => {
  try {
    const intendedBytes = parseInt((req.query.intendedBytes as string) ?? '0', 10) || 0;
    const storage = createStorage();
    const usedBytes = await getCachedUsedBytes();
    const limitBytes = storage.limitBytes;
    const usedRatio = limitBytes > 0 ? Math.min(1, usedBytes / limitBytes) : 0;
    const within = usedBytes + intendedBytes <= limitBytes;
    const fits = intendedBytes <= storage.maxFileSize;

    res.json({
      code: 0,
      message: 'ok',
      data: {
        driver: storage.driver,
        usedBytes,
        limitBytes,
        usedRatio,
        intendedBytes,
        available: within && fits,
        fileTtlMs: storage.defaultTtlMs,
        maxFileSize: storage.maxFileSize,
      },
    } satisfies ApiResponse<QuotaResponse>);
  } catch (err) {
    next(err);
  }
});
