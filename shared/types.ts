// ========================
// 通用响应
// ========================
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

// ========================
// 分片上传相关
// ========================

export type SupportedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff';

export interface ChunkStatusRequest {
  hash: string;
  totalChunks: number;
}

export interface ChunkStatusResponse {
  uploadedChunks: number[];
  isComplete: boolean;
}

export interface ChunkUploadRequest {
  hash: string;
  index: number;
  chunk: File | Blob;
}

export interface ChunkUploadResponse {
  index: number;
}

export interface MergeChunksRequest {
  hash: string;
  filename: string;
  totalChunks: number;
  fileSize: number;
  mimeType: SupportedMimeType;
}

export interface MergeChunksResponse {
  fileId: string;
  filename: string;
  fileSize: number;
  width: number;
  height: number;
  mimeType: string;
  expiresAt: number; // Unix ms; 0 表示无过期
}

// ========================
// 图片压缩相关
// ========================

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export type CompressLevel = 'light' | 'standard' | 'high' | 'aggressive' | 'extreme';

export interface CompressLevelPreset {
  level: CompressLevel;
  label: string;
  description: string;
  quality: number;
  resizeRatio: number;
  pngCompressionLevel: number;
  webpEffort: number;
}

export const COMPRESS_LEVEL_PRESETS: Record<CompressLevel, CompressLevelPreset> = {
  light: {
    level: 'light',
    label: '轻度压缩',
    description: '几乎无损，适合高保真存档',
    quality: 90,
    resizeRatio: 1,
    pngCompressionLevel: 3,
    webpEffort: 2,
  },
  standard: {
    level: 'standard',
    label: '标准压缩',
    description: '画质与体积均衡，推荐日常使用',
    quality: 75,
    resizeRatio: 1,
    pngCompressionLevel: 6,
    webpEffort: 4,
  },
  high: {
    level: 'high',
    label: '较强压缩',
    description: '体积明显减小，适合网页展示',
    quality: 60,
    resizeRatio: 1,
    pngCompressionLevel: 7,
    webpEffort: 5,
  },
  aggressive: {
    level: 'aggressive',
    label: '强力压缩',
    description: '大幅缩小，尺寸缩放至 80%，适合移动端或缩略图',
    quality: 40,
    resizeRatio: 0.8,
    pngCompressionLevel: 8,
    webpEffort: 6,
  },
  extreme: {
    level: 'extreme',
    label: '极限压缩',
    description: '最大程度压缩，尺寸缩放至 60%，画质有明显损失',
    quality: 20,
    resizeRatio: 0.6,
    pngCompressionLevel: 9,
    webpEffort: 6,
  },
};

export interface CompressRequest {
  fileId: string;
  level: CompressLevel;
  format: OutputFormat;
  quality?: number;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface CompressResponse {
  compressedFileId: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  width: number;
  height: number;
  format: OutputFormat;
  level: CompressLevel;
  previewUrl: string;
  downloadUrl: string;
  expiresAt: number; // Unix ms; 0 表示无过期
}

// ========================
// 存储配额
// ========================

export interface QuotaResponse {
  driver: 'fs' | 'blob';
  usedBytes: number;
  limitBytes: number;
  usedRatio: number;       // 0-1
  available: boolean;      // intendedBytes 能否容纳
  intendedBytes: number;   // 请求时携带的预期占用
  fileTtlMs: number;       // 当前驱动的默认 TTL
  maxFileSize: number;     // 单文件大小上限
}

// ========================
// 前端上传进度
// ========================

export type UploadStatus =
  | 'idle'
  | 'hashing'
  | 'checking'
  | 'uploading'
  | 'merging'
  | 'complete'
  | 'error';

export interface UploadProgress {
  status: UploadStatus;
  hash: string;
  filename: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: number;
  percentage: number;
  speed: number;
  errorMessage?: string;
}
