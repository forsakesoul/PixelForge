import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { COMPRESSED_DIR } from '../index.js';
import type {
  CompressRequest,
  CompressResponse,
  OutputFormat,
  CompressLevelPreset,
} from '../../../shared/types.js';
import { COMPRESS_LEVEL_PRESETS } from '../../../shared/types.js';

interface CompressOptions {
  request: CompressRequest;
  inputPath: string;
  originalSize: number;
}

function buildSharpFormat(
  preset: CompressLevelPreset,
  format: OutputFormat,
  customQuality?: number
) {
  const quality = customQuality ?? preset.quality;
  switch (format) {
    case 'jpeg':
      return { jpeg: { quality, mozjpeg: true } } as const;
    case 'png':
      return {
        png: {
          compressionLevel: preset.pngCompressionLevel,
          palette: quality < 50,
        },
      } as const;
    case 'webp':
      return { webp: { quality, effort: preset.webpEffort } } as const;
    case 'avif':
      return {
        avif: { quality, effort: Math.min(preset.webpEffort, 4) },
      } as const;
  }
}

export async function compressImage(
  opts: CompressOptions
): Promise<CompressResponse> {
  const { request, inputPath, originalSize } = opts;
  const preset = COMPRESS_LEVEL_PRESETS[request.level];

  const metadata = await sharp(inputPath).metadata();
  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;

  // 计算目标尺寸
  let targetWidth = request.width;
  let targetHeight = request.height;

  if (!targetWidth && !targetHeight && preset.resizeRatio < 1) {
    targetWidth = Math.round(origWidth * preset.resizeRatio) & ~1;
    targetHeight = Math.round(origHeight * preset.resizeRatio) & ~1;
  }

  // 构建 sharp pipeline
  let pipeline = sharp(inputPath).rotate(); // 自动校正 EXIF 方向

  if (targetWidth || targetHeight) {
    pipeline = pipeline.resize({
      width: targetWidth || undefined,
      height: targetHeight || undefined,
      fit: request.fit ?? 'inside',
      withoutEnlargement: true,
    });
  }

  // 设置输出格式
  const formatOpts = buildSharpFormat(preset, request.format, request.quality);
  if ('jpeg' in formatOpts) pipeline = pipeline.jpeg(formatOpts.jpeg);
  else if ('png' in formatOpts) pipeline = pipeline.png(formatOpts.png);
  else if ('webp' in formatOpts) pipeline = pipeline.webp(formatOpts.webp);
  else if ('avif' in formatOpts) pipeline = pipeline.avif(formatOpts.avif);

  // 输出文件
  const ext = request.format === 'jpeg' ? 'jpg' : request.format;
  const compressedFileId = `${request.fileId}_${request.level}_${Date.now()}`;
  const outputPath = path.join(COMPRESSED_DIR, `${compressedFileId}.${ext}`);

  const info = await pipeline.toFile(outputPath);

  const compressedSize = fs.statSync(outputPath).size;
  const ratio = parseFloat((compressedSize / originalSize).toFixed(4));

  return {
    compressedFileId,
    originalSize,
    compressedSize,
    ratio,
    width: info.width,
    height: info.height,
    format: request.format,
    level: request.level,
    previewUrl: `/api/preview/${compressedFileId}`,
    downloadUrl: `/api/download/${compressedFileId}`,
  };
}
