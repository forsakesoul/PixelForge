import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import type {
  ApiResponse,
  ChunkStatusResponse,
  ChunkUploadResponse,
  MergeChunksRequest,
  MergeChunksResponse,
} from '../../../shared/types.js';
import {
  getUploadedChunks,
  findExistingOriginal,
  mergeChunks,
  putChunk,
} from '../services/chunkService.js';
import { createStorage } from '../storage/index.js';
import { invalidateQuotaCache } from './quota.js';

export const uploadRouter = Router();

// multer 内存存储 — 分片在内存中处理后写入存储层
const upload = multer({
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB，留余量给 multipart overhead
  storage: multer.memoryStorage(),
});

// GET /api/upload/status
uploadRouter.get('/status', async (req, res, next) => {
  const hash = req.query.hash as string;
  const totalChunks = parseInt(req.query.totalChunks as string, 10);

  if (!hash || isNaN(totalChunks)) {
    res.status(400).json({
      code: 400,
      message: 'Missing hash or totalChunks',
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  try {
    const storage = createStorage();
    const existing = await findExistingOriginal({ storage }, hash);
    if (existing) {
      res.json({
        code: 0,
        message: 'ok',
        data: {
          uploadedChunks: Array.from({ length: totalChunks }, (_, i) => i),
          isComplete: true,
        },
      } satisfies ApiResponse<ChunkStatusResponse>);
      return;
    }

    const uploadedChunks = await getUploadedChunks({ storage }, hash);
    res.json({
      code: 0,
      message: 'ok',
      data: { uploadedChunks, isComplete: false },
    } satisfies ApiResponse<ChunkStatusResponse>);
  } catch (err) {
    next(err);
  }
});

// POST /api/upload/chunk
uploadRouter.post('/chunk', upload.single('chunk'), async (req, res, next) => {
  const hash = req.body.hash as string;
  const index = parseInt(req.body.index, 10);

  if (!hash || isNaN(index) || !req.file) {
    res.status(400).json({
      code: 400,
      message: 'Missing hash, index, or chunk file',
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  try {
    const storage = createStorage();
    await putChunk({ storage }, hash, index, req.file.buffer);
    res.json({
      code: 0,
      message: 'ok',
      data: { index },
    } satisfies ApiResponse<ChunkUploadResponse>);
  } catch (err) {
    next(err);
  }
});

// POST /api/upload/merge
uploadRouter.post('/merge', async (req, res, next) => {
  const body = req.body as MergeChunksRequest;
  const { hash, filename, totalChunks, fileSize, mimeType } = body;

  if (!hash || !filename || !totalChunks || !fileSize) {
    res.status(400).json({
      code: 400,
      message: 'Missing required fields',
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  try {
    const storage = createStorage();

    // 单文件大小校验
    if (fileSize > storage.maxFileSize) {
      res.status(413).json({
        code: 413,
        message: `File too large: max ${storage.maxFileSize} bytes`,
        data: null,
      } satisfies ApiResponse<null>);
      return;
    }

    // 配额校验（粗校验，前端应已先调用 /api/quota）
    const used = await storage.usedBytes();
    if (used + fileSize > storage.limitBytes) {
      res.status(507).json({
        code: 507,
        message: 'Storage quota exceeded. Please retry later.',
        data: null,
      } satisfies ApiResponse<null>);
      return;
    }

    // 秒传：原图已存在
    const existing = await findExistingOriginal({ storage }, hash);
    if (existing) {
      const buf = await storage.get(existing.key);
      const meta = await sharp(buf).metadata();
      res.json({
        code: 0,
        message: 'File already exists (instant upload)',
        data: {
          fileId: hash,
          filename,
          fileSize: existing.size,
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          mimeType,
          expiresAt: existing.expiresAt,
        },
      } satisfies ApiResponse<MergeChunksResponse>);
      return;
    }

    const merged = await mergeChunks(
      { storage },
      hash,
      filename,
      totalChunks,
      fileSize,
      mimeType
    );
    invalidateQuotaCache();
    const meta = await sharp(merged.buffer).metadata();

    res.json({
      code: 0,
      message: 'ok',
      data: {
        fileId: hash,
        filename,
        fileSize,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        mimeType,
        expiresAt: merged.meta.expiresAt,
      },
    } satisfies ApiResponse<MergeChunksResponse>);
  } catch (err) {
    next(err);
  }
});
