import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import type {
  PutOptions,
  ServeOptions,
  StorageAdapter,
  StorageObject,
} from './types.js';
import {
  FS_LIMIT_BYTES,
  MAX_FILE_SIZE,
  ONE_DAY_MS,
  isExpired,
} from '../utils/ttl.js';

interface FsStorageOptions {
  rootDir: string;
  ttlMs?: number;
}

export class FsStorage implements StorageAdapter {
  driver = 'fs' as const;
  defaultTtlMs: number;
  limitBytes = FS_LIMIT_BYTES;
  maxFileSize = MAX_FILE_SIZE;

  private rootDir: string;

  constructor(opts: FsStorageOptions) {
    this.rootDir = opts.rootDir;
    this.defaultTtlMs = opts.ttlMs ?? ONE_DAY_MS;
  }

  private toAbs(key: string): string {
    return path.join(this.rootDir, key);
  }

  private ensureDir(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  async put(key: string, body: Buffer, opts: PutOptions = {}): Promise<StorageObject> {
    const abs = this.toAbs(key);
    this.ensureDir(abs);
    fs.writeFileSync(abs, body);
    const stat = fs.statSync(abs);
    const ttl = opts.ttlMs ?? this.defaultTtlMs;
    return {
      key,
      size: stat.size,
      uploadedAt: stat.mtimeMs,
      expiresAt: ttl > 0 ? stat.mtimeMs + ttl : 0,
      contentType: opts.contentType,
    };
  }

  async get(key: string): Promise<Buffer> {
    const abs = this.toAbs(key);
    return fs.promises.readFile(abs);
  }

  async head(key: string): Promise<StorageObject | null> {
    const abs = this.toAbs(key);
    if (!fs.existsSync(abs)) return null;
    const stat = fs.statSync(abs);
    return {
      key,
      size: stat.size,
      uploadedAt: stat.mtimeMs,
      expiresAt: this.defaultTtlMs > 0 ? stat.mtimeMs + this.defaultTtlMs : 0,
    };
  }

  async list(prefix: string): Promise<StorageObject[]> {
    const absPrefix = this.toAbs(prefix);
    const baseDir = prefix.endsWith('/') ? absPrefix : path.dirname(absPrefix);
    if (!fs.existsSync(baseDir)) return [];

    const matches: StorageObject[] = [];
    const filenamePrefix = prefix.endsWith('/') ? '' : path.basename(absPrefix);

    const walk = (dir: string, relBase: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = path.posix.join(relBase, entry.name);
        if (entry.isDirectory()) {
          walk(abs, rel);
        } else if (entry.isFile()) {
          if (filenamePrefix && !entry.name.startsWith(filenamePrefix)) continue;
          const stat = fs.statSync(abs);
          matches.push({
            key: rel,
            size: stat.size,
            uploadedAt: stat.mtimeMs,
            expiresAt: this.defaultTtlMs > 0 ? stat.mtimeMs + this.defaultTtlMs : 0,
          });
        }
      }
    };

    const startRel = prefix.endsWith('/') ? prefix.slice(0, -1) : path.dirname(prefix);
    walk(baseDir, startRel);
    return matches;
  }

  async delete(key: string): Promise<void> {
    const abs = this.toAbs(key);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }

  async usedBytes(): Promise<number> {
    let total = 0;
    for (const top of ['uploads', 'chunks', 'compressed']) {
      const dir = path.join(this.rootDir, top);
      if (!fs.existsSync(dir)) continue;
      const stack = [dir];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const abs = path.join(cur, entry.name);
          if (entry.isDirectory()) stack.push(abs);
          else total += fs.statSync(abs).size;
        }
      }
    }
    return total;
  }

  async sweepExpired(now: number): Promise<number> {
    let deleted = 0;
    for (const top of ['uploads', 'chunks', 'compressed']) {
      const dir = path.join(this.rootDir, top);
      if (!fs.existsSync(dir)) continue;
      const stack: string[] = [dir];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const abs = path.join(cur, entry.name);
          if (entry.isDirectory()) {
            stack.push(abs);
            continue;
          }
          const stat = fs.statSync(abs);
          const expiresAt = stat.mtimeMs + this.defaultTtlMs;
          if (isExpired({ expiresAt }, now)) {
            fs.unlinkSync(abs);
            deleted++;
          }
        }
        // 清理空目录（chunks/<hash>/ 合并后留空时）
        if (cur !== dir && fs.existsSync(cur) && fs.readdirSync(cur).length === 0) {
          fs.rmdirSync(cur);
        }
      }
    }
    return deleted;
  }

  serve(res: Response, meta: StorageObject, opts: ServeOptions = {}): void {
    const abs = this.toAbs(meta.key);
    if (!fs.existsSync(abs)) {
      res.status(404).json({ code: 404, message: 'File not found', data: null });
      return;
    }
    if (opts.asDownload) {
      const filename = opts.filename ?? path.basename(meta.key);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      );
    }
    if (meta.contentType) res.setHeader('Content-Type', meta.contentType);
    res.sendFile(abs);
  }
}
