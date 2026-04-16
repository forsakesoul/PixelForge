import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import type { ApiResponse, CompressRequest, CompressResponse } from '@shared/types.js';
import { COMPRESS_LEVEL_PRESETS } from '@shared/types.js';
import { compressImage } from '../services/compressService.js';
import { UPLOAD_DIR, COMPRESSED_DIR } from '../index.js';

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

  // 查找已上传的文件
  const files = fs.readdirSync(UPLOAD_DIR);
  const target = files.find((f) => f.startsWith(fileId + '_'));
  if (!target) {
    res.status(404).json({
      code: 404,
      message: 'File not found. Please upload first.',
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  const inputPath = path.join(UPLOAD_DIR, target);
  const originalSize = fs.statSync(inputPath).size;

  try {
    const result = await compressImage({
      request: body,
      inputPath,
      originalSize,
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
compressRouter.get('/preview/:fileId', (req, res) => {
  const { fileId } = req.params;
  const type = (req.query.type as string) || 'compressed';

  const filePath = findFile(fileId, type);
  if (!filePath) {
    res.status(404).json({ code: 404, message: 'File not found', data: null });
    return;
  }

  res.sendFile(filePath);
});

// GET /api/download/:fileId
compressRouter.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params;
  const type = (req.query.type as string) || 'compressed';

  const filePath = findFile(fileId, type);
  if (!filePath) {
    res.status(404).json({ code: 404, message: 'File not found', data: null });
    return;
  }

  const basename = path.basename(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(basename)}"`);
  res.sendFile(filePath);
});

function findFile(fileId: string, type: string): string | null {
  const dir = type === 'original' ? UPLOAD_DIR : COMPRESSED_DIR;
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.startsWith(fileId));
  return match ? path.join(dir, match) : null;
}
