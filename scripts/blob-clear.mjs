#!/usr/bin/env node
// 清空 Vercel Blob（默认按前缀过滤；不带前缀=全部，需 --confirm）
// 用法：
//   BLOB_READ_WRITE_TOKEN=xxx node scripts/blob-clear.mjs --confirm                    # 全清
//   BLOB_READ_WRITE_TOKEN=xxx node scripts/blob-clear.mjs uploads/ --confirm           # 按前缀
//   BLOB_READ_WRITE_TOKEN=xxx node scripts/blob-clear.mjs --expired-only --confirm     # 仅过期
import { list, del } from '@vercel/blob';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('Missing BLOB_READ_WRITE_TOKEN');
  process.exit(1);
}

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const expiredOnly = args.includes('--expired-only');
const prefix = args.find((a) => !a.startsWith('--')) ?? '';

if (!confirm) {
  console.error('Refusing to delete without --confirm. Add --confirm to proceed.');
  process.exit(1);
}

const now = Date.now();
const targets = [];
let cursor;

do {
  const res = await list({ prefix, cursor, limit: 1000, token });
  for (const blob of res.blobs) {
    if (expiredOnly) {
      const idx = blob.pathname.lastIndexOf('__exp');
      if (idx === -1) continue;
      const ts = parseInt(blob.pathname.slice(idx + 5), 10);
      if (isNaN(ts) || ts >= now) continue;
    }
    targets.push(blob.url);
  }
  cursor = res.cursor;
} while (cursor);

if (targets.length === 0) {
  console.log('Nothing to delete.');
  process.exit(0);
}

console.log(`Deleting ${targets.length} object(s)...`);
for (let i = 0; i < targets.length; i += 100) {
  await del(targets.slice(i, i + 100), { token });
}
console.log('Done.');
