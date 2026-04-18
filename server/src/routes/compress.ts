import { Router } from 'express';
import path from 'path';
import type {
  ApiResponse,
  CompressRequest,
  CompressResponse,
} from '../../../shared/types.js';
import { COMPRESS_LEVEL_PRESETS } from '../../../shared/types.js';
import { compressImage } from '../services/compressService.js';
import { findExistingOriginal } from '../services/chunkService.js';
import { createStorage, STORAGE_KEYS } from '../storage/index.js';
import { isExpired } from '../utils/ttl.js';

export const compressRouter = Router();

// POST /api/compress
compressRouter.post('/compress', async (req, res, next) => {
  const body = req.body as CompressRequest;
  const { fileId, level, format } = body;

  if (!fileId || !level || !format) {
    res.status(400).json({
      code: 400,
      message: 'Missing fileId, level, or format',
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  if (!COMPRESS_LEVEL_PRESETS[level]) {
    res.status(400).json({
      code: 400,
      message: `Invalid level: ${level}`,
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  try {
    const storage = createStorage();
    const original = await findExistingOriginal({ storage }, fileId);
    if (!original) {
      res.status(404).json({
        code: 404,
        message: 'File not found. Please upload first.',
        data: null,
      } satisfies ApiResponse<null>);
      return;
    }
    if (isExpired(original, Date.now())) {
      // 主动清理过期资源
      await storage.delete(original.key);
      res.status(410).json({
        code: 410,
        message: 'Original file expired. Please re-upload.',
        data: null,
      } satisfies ApiResponse<null>);
      return;
    }

    const filename = path.basename(original.key).slice(fileId.length + 1);
    const inputBuffer = await storage.get(original.key);

    const result = await compressImage({
      storage,
      request: body,
      inputBuffer,
      originalSize: original.size,
      filename,
    });

    res.json({
      code: 0,
      message: 'ok',
      data: result,
    } satisfies ApiResponse<CompressResponse>);
  } catch (err) {
    next(err);
  }
});

// GET /api/preview/:fileId
compressRouter.get('/preview/:fileId', async (req, res, next) => {
  await serveFile(req.params.fileId, (req.query.type as string) || 'compressed', res, false, next);
});

// GET /api/download/:fileId
compressRouter.get('/download/:fileId', async (req, res, next) => {
  await serveFile(req.params.fileId, (req.query.type as string) || 'compressed', res, true, next);
});

async function serveFile(
  fileId: string,
  type: string,
  res: import('express').Response,
  asDownload: boolean,
  next: import('express').NextFunction
) {
  try {
    const storage = createStorage();
    const prefix =
      type === 'original'
        ? STORAGE_KEYS.originalPrefix(fileId)
        : STORAGE_KEYS.compressedPrefix(fileId);
    const matches = await storage.list(prefix);
    if (matches.length === 0) {
      res.status(404).json({ code: 404, message: 'File not found', data: null });
      return;
    }
    matches.sort((a, b) => b.uploadedAt - a.uploadedAt);
    const meta = matches[0];
    if (isExpired(meta, Date.now())) {
      await storage.delete(meta.key);
      res.status(410).json({ code: 410, message: 'File expired', data: null });
      return;
    }
    storage.serve(res, meta, { asDownload, filename: path.basename(meta.key) });
  } catch (err) {
    next(err);
  }
}
