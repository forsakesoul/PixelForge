import { put, list, del } from '@vercel/blob';
import type { Response } from 'express';
import type {
  PutOptions,
  ServeOptions,
  StorageAdapter,
  StorageObject,
} from './types.js';
import {
  FIVE_MINUTES_MS,
  FREE_TIER_LIMIT_BYTES,
  MAX_FILE_SIZE,
  isExpired,
} from '../utils/ttl.js';

interface BlobStorageOptions {
  ttlMs?: number;
  limitBytes?: number;
  token?: string;
}

// 由于 @vercel/blob 不支持 customMetadata，TTL 编码在 pathname 后缀里：
//   chunks/{hash}/0__exp1700000000000
//   uploads/{hash}_{filename}__exp1700000000000
// 这样 list() 拿到 pathname 直接能解析出 expiresAt，无额外 head 调用。
const EXPIRES_SUFFIX = '__exp';

function encodeKey(key: string, expiresAt: number): string {
  if (expiresAt <= 0) return key;
  return `${key}${EXPIRES_SUFFIX}${expiresAt}`;
}

function decodeKey(pathname: string): { key: string; expiresAt: number } {
  const idx = pathname.lastIndexOf(EXPIRES_SUFFIX);
  if (idx === -1) return { key: pathname, expiresAt: 0 };
  const tail = pathname.slice(idx + EXPIRES_SUFFIX.length);
  const expiresAt = parseInt(tail, 10);
  if (isNaN(expiresAt) || String(expiresAt) !== tail) {
    return { key: pathname, expiresAt: 0 };
  }
  return { key: pathname.slice(0, idx), expiresAt };
}

export class BlobStorage implements StorageAdapter {
  driver = 'blob' as const;
  defaultTtlMs: number;
  limitBytes: number;
  maxFileSize = MAX_FILE_SIZE;

  private token?: string;

  constructor(opts: BlobStorageOptions = {}) {
    this.defaultTtlMs = opts.ttlMs ?? FIVE_MINUTES_MS;
    this.limitBytes = opts.limitBytes ?? FREE_TIER_LIMIT_BYTES;
    this.token = opts.token;
  }

  private get tokenOpt(): { token?: string } {
    return this.token ? { token: this.token } : {};
  }

  async put(key: string, body: Buffer, opts: PutOptions = {}): Promise<StorageObject> {
    const ttl = opts.ttlMs ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    const pathname = encodeKey(key, expiresAt);

    const result = await put(pathname, body, {
      access: 'public',
      contentType: opts.contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: ttl > 0 ? Math.max(60, Math.floor(ttl / 1000)) : undefined,
      ...this.tokenOpt,
    });

    return {
      key,
      size: body.length,
      uploadedAt: Date.now(),
      expiresAt,
      contentType: opts.contentType ?? result.contentType,
      url: result.url,
      downloadUrl: result.downloadUrl,
    };
  }

  async get(key: string): Promise<Buffer> {
    const meta = await this.head(key);
    if (!meta || !meta.url) throw new Error(`Blob not found: ${key}`);
    const res = await fetch(meta.url);
    if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async head(key: string): Promise<StorageObject | null> {
    const matches = await this.list(key);
    return matches.find((m) => m.key === key) ?? null;
  }

  async list(prefix: string): Promise<StorageObject[]> {
    const objects: StorageObject[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({
        prefix,
        cursor,
        limit: 1000,
        ...this.tokenOpt,
      });
      for (const blob of res.blobs) {
        const { key, expiresAt } = decodeKey(blob.pathname);
        if (!key.startsWith(prefix)) continue;
        objects.push({
          key,
          size: blob.size,
          uploadedAt: new Date(blob.uploadedAt).getTime(),
          expiresAt,
          url: blob.url,
          downloadUrl: blob.downloadUrl,
        });
      }
      cursor = res.cursor;
    } while (cursor);
    return objects;
  }

  async delete(key: string): Promise<void> {
    const matches = await this.list(key);
    const exact = matches.filter((m) => m.key === key);
    if (exact.length === 0) return;
    await del(exact.map((m) => m.url!), this.tokenOpt);
  }

  async usedBytes(): Promise<number> {
    let total = 0;
    let cursor: string | undefined;
    do {
      const res = await list({ cursor, limit: 1000, ...this.tokenOpt });
      for (const blob of res.blobs) total += blob.size;
      cursor = res.cursor;
    } while (cursor);
    return total;
  }

  async sweepExpired(now: number): Promise<number> {
    const urls: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ cursor, limit: 1000, ...this.tokenOpt });
      for (const blob of res.blobs) {
        const { expiresAt } = decodeKey(blob.pathname);
        if (isExpired({ expiresAt }, now)) urls.push(blob.url);
      }
      cursor = res.cursor;
    } while (cursor);
    if (urls.length === 0) return 0;
    for (let i = 0; i < urls.length; i += 100) {
      await del(urls.slice(i, i + 100), this.tokenOpt);
    }
    return urls.length;
  }

  serve(res: Response, meta: StorageObject, opts: ServeOptions = {}): void {
    if (opts.asDownload && meta.downloadUrl) {
      res.redirect(302, meta.downloadUrl);
      return;
    }
    if (meta.url) {
      res.redirect(302, meta.url);
      return;
    }
    res.status(404).json({ code: 404, message: 'Blob URL missing', data: null });
  }
}
