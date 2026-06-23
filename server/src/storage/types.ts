import type { Response } from 'express';

export type StorageDriver = 'fs' | 'blob';

export interface StorageObject {
  key: string;
  size: number;
  uploadedAt: number;     // Unix ms
  expiresAt: number;      // Unix ms; 0 表示无过期
  contentType?: string;
  url?: string;           // 公网可访问 URL（blob 才有）
  downloadUrl?: string;   // 触发下载的 URL（blob 才有）
}

export interface PutOptions {
  contentType?: string;
  ttlMs?: number;
  filename?: string;      // 用于 Content-Disposition
}

export interface ServeOptions {
  asDownload?: boolean;
  filename?: string;
}

export interface StorageAdapter {
  driver: StorageDriver;
  defaultTtlMs: number;
  limitBytes: number;
  maxFileSize: number;

  put(key: string, body: Buffer, opts?: PutOptions): Promise<StorageObject>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<StorageObject | null>;
  list(prefix: string): Promise<StorageObject[]>;
  delete(key: string): Promise<void>;

  usedBytes(): Promise<number>;
  sweepExpired(now: number): Promise<number>;

  serve(res: Response, meta: StorageObject, opts?: ServeOptions): Promise<void> | void;
}

export const STORAGE_KEYS = {
  chunkPrefix: (hash: string) => `chunks/${hash}/`,
  chunk: (hash: string, index: number) => `chunks/${hash}/${index}`,
  originalPrefix: (hash: string) => `uploads/${hash}_`,
  original: (hash: string, filename: string) => `uploads/${hash}_${filename}`,
  compressedPrefix: (id: string) => `compressed/${id}`,
  compressed: (id: string, ext: string) => `compressed/${id}.${ext}`,
};
