import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../../../shared/types.js';
import { createStorage } from '../storage/index.js';
import { invalidateQuotaCache } from './quota.js';

export const adminRouter = Router();

function authGuard(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CLEANUP_SECRET;
  if (!secret) {
    res.status(503).json({
      code: 503,
      message: 'CLEANUP_SECRET not configured',
      data: null,
    });
    return;
  }
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    res.status(401).json({ code: 401, message: 'Unauthorized', data: null });
    return;
  }
  next();
}

// POST /api/admin/cleanup
adminRouter.post('/cleanup', authGuard, async (_req, res, next) => {
  try {
    const storage = createStorage();
    const deleted = await storage.sweepExpired(Date.now());
    if (deleted > 0) invalidateQuotaCache();
    const remainingBytes = await storage.usedBytes();
    res.json({
      code: 0,
      message: 'ok',
      data: { deleted, remainingBytes, driver: storage.driver },
    } satisfies ApiResponse<{
      deleted: number;
      remainingBytes: number;
      driver: 'fs' | 'blob';
    }>);
  } catch (err) {
    next(err);
  }
});
