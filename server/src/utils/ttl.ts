// 存储驱动相关常量与小工具
export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const FREE_TIER_LIMIT_BYTES = 800 * 1024 * 1024;     // Vercel Blob 1GB 免费额度，预留 200MB 缓冲
export const FS_LIMIT_BYTES = Number.MAX_SAFE_INTEGER;       // 本地不限制
export const MAX_FILE_SIZE = 50 * 1024 * 1024;              // 单文件 50MB

export function isExpired(meta: { expiresAt: number }, now: number): boolean {
  return meta.expiresAt > 0 && meta.expiresAt < now;
}
