export interface ApiResponse<T = unknown> {
    code: number;
    message: string;
    data: T;
}
export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'image/gif' | 'image/bmp' | 'image/tiff';
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
}
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
export declare const COMPRESS_LEVEL_PRESETS: Record<CompressLevel, CompressLevelPreset>;
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
}
export type UploadStatus = 'idle' | 'hashing' | 'checking' | 'uploading' | 'merging' | 'complete' | 'error';
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
