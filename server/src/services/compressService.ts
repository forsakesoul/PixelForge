import sharp from 'sharp';
import type {
  CompressRequest,
  CompressResponse,
  OutputFormat,
  CompressLevelPreset,
} from '../../../shared/types.js';
import { COMPRESS_LEVEL_PRESETS } from '../../../shared/types.js';
import type { StorageAdapter, StorageObject } from '../storage/index.js';
import { STORAGE_KEYS } from '../storage/index.js';

interface CompressOptions {
  storage: StorageAdapter;
  request: CompressRequest;
  inputBuffer: Buffer;
  originalSize: number;
  filename: string;
}

const MIME_BY_FORMAT: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

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
  const { storage, request, inputBuffer, originalSize, filename } = opts;
  const preset = COMPRESS_LEVEL_PRESETS[request.level];

  const metadata = await sharp(inputBuffer).metadata();
  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;

  let targetWidth = request.width;
  let targetHeight = request.height;

  if (!targetWidth && !targetHeight && preset.resizeRatio < 1) {
    targetWidth = Math.round(origWidth * preset.resizeRatio) & ~1;
    targetHeight = Math.round(origHeight * preset.resizeRatio) & ~1;
  }

  let pipeline = sharp(inputBuffer).rotate();

  if (targetWidth || targetHeight) {
    pipeline = pipeline.resize({
      width: targetWidth || undefined,
      height: targetHeight || undefined,
      fit: request.fit ?? 'inside',
      withoutEnlargement: true,
    });
  }

  const formatOpts = buildSharpFormat(preset, request.format, request.quality);
  if ('jpeg' in formatOpts) pipeline = pipeline.jpeg(formatOpts.jpeg);
  else if ('png' in formatOpts) pipeline = pipeline.png(formatOpts.png);
  else if ('webp' in formatOpts) pipeline = pipeline.webp(formatOpts.webp);
  else if ('avif' in formatOpts) pipeline = pipeline.avif(formatOpts.avif);

  const ext = request.format === 'jpeg' ? 'jpg' : request.format;
  const compressedFileId = `${request.fileId}_${request.level}_${Date.now()}`;
  const key = STORAGE_KEYS.compressed(compressedFileId, ext);

  const { data: outBuffer, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const baseName = filename.replace(/\.[^.]+$/, '');
  const downloadName = `${baseName}_compressed.${ext}`;

  const stored: StorageObject = await storage.put(key, outBuffer, {
    contentType: MIME_BY_FORMAT[request.format],
    filename: downloadName,
  });

  const compressedSize = outBuffer.length;
  const ratio = parseFloat((compressedSize / originalSize).toFixed(4));

  // 在 fs 模式仍走 /api/preview/:id 路由（兼容 dev 环境的 vite 代理）
  // 在 blob 模式直接返回公网 URL，省一次函数调用
  const previewUrl = stored.url ?? `/api/preview/${compressedFileId}`;
  const downloadUrl = stored.downloadUrl ?? `/api/download/${compressedFileId}`;

  return {
    compressedFileId,
    originalSize,
    compressedSize,
    ratio,
    width: info.width,
    height: info.height,
    format: request.format,
    level: request.level,
    previewUrl,
    downloadUrl,
    expiresAt: stored.expiresAt,
  };
}
