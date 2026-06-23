import type { StorageAdapter, StorageObject } from '../storage/index.js';
import { STORAGE_KEYS } from '../storage/index.js';

export interface ChunkServiceContext {
  storage: StorageAdapter;
}

export async function getUploadedChunks(
  ctx: ChunkServiceContext,
  hash: string
): Promise<number[]> {
  const objs = await ctx.storage.list(STORAGE_KEYS.chunkPrefix(hash));
  const indexes: number[] = [];
  for (const obj of objs) {
    const tail = obj.key.slice(STORAGE_KEYS.chunkPrefix(hash).length);
    const idx = parseInt(tail, 10);
    if (!isNaN(idx)) indexes.push(idx);
  }
  return indexes.sort((a, b) => a - b);
}

export async function findExistingOriginal(
  ctx: ChunkServiceContext,
  hash: string
): Promise<StorageObject | null> {
  const matches = await ctx.storage.list(STORAGE_KEYS.originalPrefix(hash));
  if (matches.length === 0) return null;
  // 取最新的一个
  matches.sort((a, b) => b.uploadedAt - a.uploadedAt);
  return matches[0];
}

export async function putChunk(
  ctx: ChunkServiceContext,
  hash: string,
  index: number,
  buf: Buffer
): Promise<void> {
  await ctx.storage.put(STORAGE_KEYS.chunk(hash, index), buf, {
    contentType: 'application/octet-stream',
  });
}

export async function mergeChunks(
  ctx: ChunkServiceContext,
  hash: string,
  filename: string,
  totalChunks: number,
  expectedSize: number,
  mimeType: string
): Promise<{ key: string; meta: StorageObject; buffer: Buffer }> {
  if (expectedSize > ctx.storage.maxFileSize) {
    throw new Error(
      `File too large: ${expectedSize} > ${ctx.storage.maxFileSize}`
    );
  }

  const existing = await getUploadedChunks(ctx, hash);
  if (existing.length !== totalChunks) {
    throw new Error(
      `Chunks incomplete: expected ${totalChunks}, got ${existing.length}`
    );
  }

  // 顺序读取并 concat
  const buffers: Buffer[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const buf = await ctx.storage.get(STORAGE_KEYS.chunk(hash, i));
    buffers.push(buf);
  }
  const merged = Buffer.concat(buffers);

  if (merged.length !== expectedSize) {
    throw new Error(
      `File size mismatch: expected ${expectedSize}, got ${merged.length}`
    );
  }

  const key = STORAGE_KEYS.original(hash, filename);
  const meta = await ctx.storage.put(key, merged, {
    contentType: mimeType,
    filename,
  });

  // 异步清理分片，不阻塞响应
  void deleteChunks(ctx, hash).catch((err) =>
    console.warn(`[chunkService] cleanup chunks failed for ${hash}:`, err)
  );

  return { key, meta, buffer: merged };
}

export async function deleteChunks(
  ctx: ChunkServiceContext,
  hash: string
): Promise<void> {
  const objs = await ctx.storage.list(STORAGE_KEYS.chunkPrefix(hash));
  for (const obj of objs) {
    await ctx.storage.delete(obj.key);
  }
}
