#!/usr/bin/env node
// 查询当前存储用量
// 用法：
//   STORAGE_DRIVER=fs node scripts/quota-check.mjs
//   STORAGE_DRIVER=blob BLOB_READ_WRITE_TOKEN=xxx node scripts/quota-check.mjs
import { list } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fmt(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const driver = (process.env.STORAGE_DRIVER ?? '').toLowerCase();
const useBlob = driver === 'blob' || (driver === '' && !!process.env.VERCEL);

if (useBlob) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Missing BLOB_READ_WRITE_TOKEN');
    process.exit(1);
  }
  let total = 0;
  let count = 0;
  let cursor;
  do {
    const res = await list({ cursor, limit: 1000, token });
    for (const blob of res.blobs) {
      total += blob.size;
      count++;
    }
    cursor = res.cursor;
  } while (cursor);
  const limit = Number(process.env.QUOTA_LIMIT_BYTES) || 800 * 1024 * 1024;
  console.log(`[blob] objects=${count} used=${fmt(total)} limit=${fmt(limit)} (${((total / limit) * 100).toFixed(1)}%)`);
} else {
  const root = process.env.STORAGE_FS_ROOT
    ? path.resolve(process.env.STORAGE_FS_ROOT)
    : path.resolve(__dirname, '..', 'server');
  let total = 0;
  let count = 0;
  for (const top of ['uploads', 'chunks', 'compressed']) {
    const dir = path.join(root, top);
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        const p = path.join(cur, entry.name);
        if (entry.isDirectory()) stack.push(p);
        else {
          total += fs.statSync(p).size;
          count++;
        }
      }
    }
  }
  console.log(`[fs] root=${root} files=${count} used=${fmt(total)}`);
}
