import fs from 'fs';
import path from 'path';
import { CHUNK_DIR, UPLOAD_DIR } from '../index.js';

export function getUploadedChunks(hash: string): number[] {
  const chunkDir = path.join(CHUNK_DIR, hash);
  if (!fs.existsSync(chunkDir)) return [];
  return fs
    .readdirSync(chunkDir)
    .filter((f) => f.startsWith('chunk-'))
    .map((f) => parseInt(f.split('-')[1], 10))
    .sort((a, b) => a - b);
}

export function isFileComplete(hash: string): boolean {
  const files = fs.readdirSync(UPLOAD_DIR);
  return files.some((f) => f.startsWith(hash + '_'));
}

export function getChunkDir(hash: string): string {
  const dir = path.join(CHUNK_DIR, hash);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function mergeChunks(
  hash: string,
  filename: string,
  totalChunks: number,
  expectedSize: number
): Promise<string> {
  const chunkDir = path.join(CHUNK_DIR, hash);
  const outputPath = path.join(UPLOAD_DIR, `${hash}_${filename}`);

  // 检查分片完整性
  const existing = getUploadedChunks(hash);
  if (existing.length !== totalChunks) {
    throw new Error(
      `Chunks incomplete: expected ${totalChunks}, got ${existing.length}`
    );
  }

  // 流式合并
  const writeStream = fs.createWriteStream(outputPath);
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunkDir, `chunk-${i}`);
    if (!fs.existsSync(chunkPath)) {
      writeStream.destroy();
      throw new Error(`Missing chunk: ${i}`);
    }
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(chunkPath);
      readStream.pipe(writeStream, { end: false });
      readStream.on('end', resolve);
      readStream.on('error', reject);
    });
  }
  writeStream.end();
  await new Promise<void>((resolve) => writeStream.on('finish', resolve));

  // 校验文件大小
  const stat = fs.statSync(outputPath);
  if (stat.size !== expectedSize) {
    fs.unlinkSync(outputPath);
    throw new Error(
      `File size mismatch: expected ${expectedSize}, got ${stat.size}`
    );
  }

  // 清理分片
  fs.rmSync(chunkDir, { recursive: true, force: true });

  return outputPath;
}
