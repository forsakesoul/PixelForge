import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import fs from 'fs';
import type { ApiResponse, ChunkStatusResponse, ChunkUploadResponse, MergeChunksRequest, MergeChunksResponse } from '../../../shared/types.js';
import { getUploadedChunks, isFileComplete, getChunkDir, mergeChunks } from '../services/chunkService.js';
import { UPLOAD_DIR } from '../index.js';

export const uploadRouter = Router();

// multer 配置：分片临时存内存，手动写入磁盘
const upload = multer({
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB，略大于 2MB 分片
});

// 合并锁，防止同一文件并发合并
const mergeLocks = new Set<string>();

// GET /api/upload/status
uploadRouter.get('/status', (req, res) => {
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

  // 先检查是否已有完整文件（秒传）
  if (isFileComplete(hash)) {
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

  const uploadedChunks = getUploadedChunks(hash);
  res.json({
    code: 0,
    message: 'ok',
    data: { uploadedChunks, isComplete: false },
  } satisfies ApiResponse<ChunkStatusResponse>);
});

// POST /api/upload/chunk
uploadRouter.post('/chunk', upload.single('chunk'), (req, res) => {
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

  const chunkDir = getChunkDir(hash);
  const chunkPath = path.join(chunkDir, `chunk-${index}`);
  fs.writeFileSync(chunkPath, req.file.buffer);

  res.json({
    code: 0,
    message: 'ok',
    data: { index },
  } satisfies ApiResponse<ChunkUploadResponse>);
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

  // 秒传：文件已存在
  const existingFile = fs.readdirSync(UPLOAD_DIR).find((f) => f.startsWith(hash + '_'));
  if (existingFile) {
    try {
      const filePath = path.join(UPLOAD_DIR, existingFile);
      const metadata = await sharp(filePath).metadata();
      res.json({
        code: 0,
        message: 'File already exists (instant upload)',
        data: {
          fileId: hash,
          filename,
          fileSize: fs.statSync(filePath).size,
          width: metadata.width ?? 0,
          height: metadata.height ?? 0,
          mimeType,
        },
      } satisfies ApiResponse<MergeChunksResponse>);
    } catch (err) {
      next(err);
    }
    return;
  }

  // 并发合并锁
  if (mergeLocks.has(hash)) {
    res.status(409).json({
      code: 409,
      message: 'Merge already in progress',
      data: null,
    } satisfies ApiResponse<null>);
    return;
  }

  mergeLocks.add(hash);
  try {
    const outputPath = await mergeChunks(hash, filename, totalChunks, fileSize);
    const metadata = await sharp(outputPath).metadata();

    res.json({
      code: 0,
      message: 'ok',
      data: {
        fileId: hash,
        filename,
        fileSize,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        mimeType,
      },
    } satisfies ApiResponse<MergeChunksResponse>);
  } catch (err) {
    next(err);
  } finally {
    mergeLocks.delete(hash);
  }
});
