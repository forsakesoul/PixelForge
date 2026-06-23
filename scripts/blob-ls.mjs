#!/usr/bin/env node
// 列出 Vercel Blob 中所有对象（按 prefix 可选）
// 用法：
//   BLOB_READ_WRITE_TOKEN=xxx node scripts/blob-ls.mjs                        # 全部
//   BLOB_READ_WRITE_TOKEN=xxx node scripts/blob-ls.mjs uploads/               # 指定前缀
import { list } from '@vercel/blob';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('Missing BLOB_READ_WRITE_TOKEN');
  process.exit(1);
}
const prefix = process.argv[2] ?? '';

let cursor;
let count = 0;
let total = 0;
const now = Date.now();

do {
  const res = await list({ prefix, cursor, limit: 1000, token });
  for (const blob of res.blobs) {
    count++;
    total += blob.size;
    const idx = blob.pathname.lastIndexOf('__exp');
    let exp = '-';
    if (idx !== -1) {
      const ts = parseInt(blob.pathname.slice(idx + 5), 10);
      if (!isNaN(ts)) {
        const left = ts - now;
        exp = left > 0 ? `${Math.ceil(left / 1000)}s` : 'EXPIRED';
      }
    }
    console.log(`${blob.uploadedAt}  ${String(blob.size).padStart(10)}  ${exp.padStart(8)}  ${blob.pathname}`);
  }
  cursor = res.cursor;
} while (cursor);

console.log(`\nTotal: ${count} object(s), ${(total / 1024 / 1024).toFixed(2)} MB`);
