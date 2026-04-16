import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { uploadRouter } from './routes/upload.js';
import { compressRouter } from './routes/compress.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = 3001;

// 用 process.cwd() 定位 server/ 目录（dev 和 serve 都从 server/ 运行）
const SERVER_ROOT = process.cwd();

// 确保临时目录存在
const dirs = ['uploads', 'chunks', 'compressed'].map((d) =>
  path.resolve(SERVER_ROOT, d)
);
dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

export const UPLOAD_DIR = dirs[0];
export const CHUNK_DIR = dirs[1];
export const COMPRESSED_DIR = dirs[2];

app.use(cors());
app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api', compressRouter);

// 生产模式托管前端静态资源
const clientDist = path.resolve(SERVER_ROOT, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

// 定时清理过期分片（每小时执行一次，清理 24h 前的）
const CHUNK_EXPIRE_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const chunkBase = CHUNK_DIR;
  if (!fs.existsSync(chunkBase)) return;
  const now = Date.now();
  for (const dir of fs.readdirSync(chunkBase)) {
    const fullPath = path.join(chunkBase, dir);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && now - stat.mtimeMs > CHUNK_EXPIRE_MS) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`[cleanup] removed expired chunks: ${dir}`);
    }
  }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
