#!/usr/bin/env node
// 本地清理：删除 server/uploads, server/chunks, server/compressed 下的所有文件
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'server');

const dirs = ['uploads', 'chunks', 'compressed'];
let total = 0;

for (const d of dirs) {
  const abs = path.join(root, d);
  if (!fs.existsSync(abs)) continue;
  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
      } else {
        fs.unlinkSync(p);
        total++;
      }
    }
  }
  // 删空子目录
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(abs, entry.name);
      if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
    }
  }
}

console.log(`[cleanup-local] removed ${total} file(s)`);
