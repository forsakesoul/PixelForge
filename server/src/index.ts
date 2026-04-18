import path from 'path';
import fs from 'fs';
import { createApp } from './app.js';
import { createStorage } from './storage/index.js';
import { ONE_DAY_MS } from './utils/ttl.js';

const PORT = Number(process.env.PORT) || 3001;
const SERVER_ROOT = process.cwd();

// 本地预创建目录（仅 fs 驱动需要）
if (!process.env.STORAGE_DRIVER || process.env.STORAGE_DRIVER === 'fs') {
  ['uploads', 'chunks', 'compressed'].forEach((d) => {
    const dir = path.resolve(SERVER_ROOT, d);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

const clientDist = path.resolve(SERVER_ROOT, '../client/dist');
const app = createApp({
  serveClient: fs.existsSync(clientDist),
  clientDistDir: clientDist,
});

// 仅本地 fs 模式启用定时清理
const storage = createStorage();
if (storage.driver === 'fs') {
  const interval = Math.min(60 * 60 * 1000, Math.max(60 * 1000, storage.defaultTtlMs / 2));
  setInterval(() => {
    storage.sweepExpired(Date.now()).then((n) => {
      if (n > 0) console.log(`[cleanup] removed ${n} expired files`);
    }).catch((err) => console.error('[cleanup] failed:', err));
  }, interval);
  console.log(`[storage] fs driver, ttl=${storage.defaultTtlMs}ms (default ${ONE_DAY_MS}ms)`);
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
