# Vercel 部署改造记录

> 本文记录 `feat/vercel-deploy` 分支为支持部署到 Vercel 所做的全部改动。
> 默认 5 分钟 TTL、Vercel Blob 存储、保持本地 fs 行为不变、固定在免费额度内。

## 一、核心改造点

| 维度 | 改造前 | 改造后 |
|------|-------|-------|
| 存储 | 本地 fs（`uploads/` `chunks/` `compressed/`） | 抽象 `StorageAdapter`：`FsStorage`（本地） / `BlobStorage`（Vercel） |
| TTL | 24h，定时器扫描 | fs 仍 24h；Blob 5 分钟，三道清理 |
| 合并锁 | 内存 `Set` | 删除，改为幂等合并（同 hash 文件已存在则秒传） |
| 合并方式 | 流式 pipe 到磁盘 | 内存 Buffer concat，再写 Blob/fs |
| 压缩输入 | `sharp(filePath)` | `sharp(buffer)` |
| 压缩输出 | `pipeline.toFile(...)` | `pipeline.toBuffer()` → `storage.put(...)` |
| 预览/下载 URL | 本地路由 `/api/preview/:id` | fs 同上；Blob 直接返回公网 URL，省一次函数调用 |
| 部署入口 | `node dist/.../index.js` | Express 仍由 `index.ts` 启动；Vercel 通过 `api/index.ts` 直接导出 handler |
| 配额 | 无 | `/api/quota` + 上传前预检 + 服务端 507 兜底 |
| 清理 | `setInterval`（仅本地） | 本地保留；Blob 由 GitHub Actions 每 5 分钟打 `/api/admin/cleanup`，配合读时惰性删除 |

## 二、目录结构变化

新增：

```
api/index.ts                      # Vercel Function 入口（直接调用 Express app）
vercel.json                       # 路由 / 函数 / 构建配置
.env.example                      # 环境变量示例
.github/workflows/cleanup.yml     # GitHub Actions 定时器（5min）
scripts/
  cleanup-local.mjs               # 本地清理 uploads/chunks/compressed
  quota-check.mjs                 # 查询 fs / blob 用量
  blob-ls.mjs                     # 列出 Blob 对象（可按前缀）
  blob-clear.mjs                  # 清理 Blob（支持 --expired-only）
server/src/
  app.ts                          # 抽出的 createApp() 工厂
  storage/
    types.ts                      # StorageAdapter 接口 + STORAGE_KEYS
    fsStorage.ts                  # 本地 fs 实现
    blobStorage.ts                # Vercel Blob 实现
    index.ts                      # 工厂 createStorage()
  routes/
    quota.ts                      # GET /api/quota
    admin.ts                      # POST /api/admin/cleanup
  utils/
    ttl.ts                        # TTL / 配额常量
client/src/components/
  QuotaBar.tsx                    # 顶部存储用量条
docs/
  vercel-deploy.md                # 本文
```

修改：

```
shared/types.ts                   # 增 expiresAt 字段、QuotaResponse 类型
server/src/index.ts               # 改为本地启动入口；调用 createApp()
server/src/services/chunkService.ts   # 走 storage 层；Buffer 合并
server/src/services/compressService.ts# Buffer 输入/输出；走 storage 层
server/src/routes/upload.ts       # 删 mergeLocks；加配额校验；用 storage
server/src/routes/compress.ts     # 用 storage；preview/download 兼容 fs/blob
server/package.json               # +@vercel/blob, +@types/node
client/src/utils/chunkedUpload.ts # 上传前调 /api/quota；处理 507
client/src/components/ImagePreview.tsx# expiresAt 倒计时；过期禁用下载
client/src/App.tsx                # 引入 QuotaBar；上传/压缩后刷新用量
package.json                      # 新增 npm 脚本：deploy / blob:* / quota:check / cleanup:local
.gitignore                        # +.vercel/
```

## 三、StorageAdapter 接口

`server/src/storage/types.ts`：

```ts
export interface StorageObject {
  key: string;
  size: number;
  uploadedAt: number;     // Unix ms
  expiresAt: number;      // 0 表示无过期
  contentType?: string;
  url?: string;           // 公网 URL（仅 blob）
  downloadUrl?: string;   // 触发下载的 URL（仅 blob）
}

export interface StorageAdapter {
  driver: 'fs' | 'blob';
  defaultTtlMs: number;
  limitBytes: number;
  maxFileSize: number;

  put(key, body, opts?): Promise<StorageObject>;
  get(key): Promise<Buffer>;
  head(key): Promise<StorageObject | null>;
  list(prefix): Promise<StorageObject[]>;
  delete(key): Promise<void>;

  usedBytes(): Promise<number>;
  sweepExpired(now): Promise<number>;

  serve(res, meta, opts?): Promise<void> | void;   // fs: pipe; blob: 302
}
```

驱动选择由 `createStorage()` 决定：

```
STORAGE_DRIVER=blob   → BlobStorage
STORAGE_DRIVER=fs     → FsStorage
未设置时:
  process.env.VERCEL  → BlobStorage
  否则                 → FsStorage
```

### Blob TTL 编码

Vercel Blob 不支持 customMetadata，因此把过期时间编码进 pathname：

```
chunks/{hash}/0__exp1734567890123
uploads/{hash}_{filename}__exp1734567890123
compressed/{id}.{ext}__exp1734567890123
```

`__exp` 后缀在 `decodeKey()` 中被剥离，`list()` 可直接拿到 `expiresAt`，无需额外 `head()` 调用。

## 四、TTL 与清理

| 阶段 | 触发 | 实现 |
|------|------|------|
| 写入时 | `put()` 设 `expiresAt = now + TTL`；blob 同时设 `cacheControlMaxAge = TTL/1000`（最小 60s） |
| 读时惰性 | `/api/preview/:id` `/api/download/:id` `/api/compress` 命中过期 → `storage.delete(key)` + 返回 410 |
| 定时清理 | GitHub Actions `*/5 * * * *` POST `/api/admin/cleanup`（带 `Authorization: Bearer $CLEANUP_SECRET`） |
| 本地 fs | `index.ts` 内 `setInterval`，间隔 = `min(1h, max(1min, TTL/2))` |

`/api/admin/cleanup` 响应：

```json
{ "code": 0, "data": { "deleted": 12, "remainingBytes": 524288000, "driver": "blob" } }
```

## 五、配额保护

- 默认上限：`800MB`（保留 `200MB` 缓冲，对应 Vercel Blob 1GB 免费额度）。
- 默认单文件上限：`50MB`。
- `GET /api/quota?intendedBytes=N`：返回 `usedBytes / limitBytes / available / fileTtlMs / maxFileSize`。
  - `usedBytes` 进程内缓存 30s，减少 `list()` 开销。
- 前端 `QuotaBar` 进入页面时调一次；上传 / 压缩成功后通过 `refreshKey` 触发重新拉取。
- `chunkedUpload()` 起步先调 `/api/quota`，`available=false` 直接抛错（**拒绝即可**，不做强制驱逐）。
- 服务端 `/api/upload/merge` 兜底再校验：超额返回 `507 Insufficient Storage`。
- `/api/upload/chunk` 也会在收到 `507` 时抛错给前端。

## 六、API 变化清单

| 路由 | 变化 | 说明 |
|------|------|------|
| `GET /api/upload/status` | 行为不变 | 内部走 `storage.list()` |
| `POST /api/upload/chunk` | 行为不变 | 内部 `storage.put()` |
| `POST /api/upload/merge` | 响应增加 `expiresAt` | 配额预检 + 内存合并 |
| `POST /api/compress` | 响应增加 `expiresAt`；可能返回 `410` | 输入 Buffer；blob 模式输出 URL 为 Blob 公网 URL |
| `GET /api/preview/:fileId` | fs：直接 sendFile；blob：302 → Blob URL | 命中过期返回 410 |
| `GET /api/download/:fileId` | 同上 | blob 走 `downloadUrl`（带 attachment header） |
| `GET /api/quota` *(新)* | — | 含 `intendedBytes` 校验 |
| `POST /api/admin/cleanup` *(新)* | — | 鉴权 `Authorization: Bearer $CLEANUP_SECRET` |

## 七、前端变化

- `chunkedUpload.ts`：导出新增 `fetchQuota(intendedBytes)`；上传前先校验配额；`507` 错误友好提示。
- `ImagePreview.tsx`：`expiresAt > 0` 时显示 `mm:ss` 倒计时；归零后按钮变灰提示"已过期"；下载 410 抛错。
- `QuotaBar.tsx`：顶部进度条，展示 `已用 / 总额` 和驱动类型 + 文件保留时长。
- `App.tsx`：上传/压缩成功后 `setQuotaRefresh(n => n+1)` 触发 QuotaBar 拉新。

## 八、Vercel 部署配置

`vercel.json`：

```json
{
  "version": 2,
  "buildCommand": "npm run build:vercel",
  "outputDirectory": "client/dist",
  "installCommand": "npm install --legacy-peer-deps && cd client && npm install --legacy-peer-deps && cd ../server && npm install --legacy-peer-deps",
  "functions": {
    "api/index.ts": { "memory": 1024, "maxDuration": 10 }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

- `buildCommand` 串行构建 client 和 server。Server 的 `tsc` 输出 `server/dist/server/src/app.js`。
- `api/index.ts` 动态 import Express app，并直接作为 Vercel Node handler 调用。
- 所有 `/api/*` 请求 rewrite 到 `api/index`，由 Express 内部路由分发。
- 函数内存 1024MB，时长 10s（Hobby 上限）。

### 必须配置的环境变量（Vercel 项目面板）

| 变量 | 说明 |
|------|------|
| `BLOB_READ_WRITE_TOKEN` | 启用 Vercel Blob 后由 Vercel 自动注入 |
| `CLEANUP_SECRET` | `/api/admin/cleanup` 鉴权 token，自行生成强随机串 |
| `STORAGE_DRIVER` | 可选，强制为 `blob`（默认在 Vercel 上即为 blob） |
| `FILE_TTL_MS` | 可选，覆盖 5 分钟默认 TTL |
| `QUOTA_LIMIT_BYTES` | 可选，覆盖 800MB 上限 |

### GitHub Actions Secrets（用于定时清理）

| Secret | 值 |
|--------|-----|
| `BLOB_READ_WRITE_TOKEN` | 推荐。填 Vercel Blob 的读写 token，Actions 会直接执行 `npm run blob:clear:expired` |
| `CLEANUP_ENDPOINT` | 可选回退。例：`https://yourapp.vercel.app/api/admin/cleanup` |
| `CLEANUP_SECRET` | 可选回退。与 Vercel 端一致，必须和 `CLEANUP_ENDPOINT` 一起配置 |

## 九、新增的 npm 脚本

```bash
npm run deploy             # vercel --prod
npm run deploy:preview     # vercel
npm run cleanup:local      # 清理本地 server/uploads chunks compressed
npm run quota:check        # 查询当前用量（fs 或 blob，按环境变量决定）
npm run blob:ls            # 列出 Blob，例 npm run blob:ls -- uploads/
npm run blob:clear         # 清理 Blob（须加 --confirm 与可选 prefix）
npm run blob:clear:expired # 仅清理过期 Blob
```

所有 Blob 相关脚本要求 `BLOB_READ_WRITE_TOKEN` 在环境中。

## 十、本地开发 vs 生产差异

|  | 本地（`npm start`） | Vercel 生产 |
|---|------|------|
| 入口 | `server/src/index.ts` | `api/index.ts`（包装 Express） |
| 存储 | fs（`server/uploads`、`server/chunks`、`server/compressed`） | Vercel Blob |
| TTL | 24h | 5 分钟 |
| 配额 | 不限 | 800MB |
| 清理 | `setInterval`（最快每分钟一次） | GitHub Actions + 读时惰性 |
| 静态托管 | server 在 `client/dist` 存在时托管 | 走 Vercel 自带静态托管 |
| 单文件上限 | 50MB（与生产一致，便于本地复现） | 50MB |

## 十一、风险与遗留点

| 风险 | 缓解 |
|------|------|
| sharp 冷启动慢 | 接受；可后续改 Vercel 预编译 layer |
| 大图压缩可能 >10s 超时 | `vercel.json` `maxDuration=10`；超时由前端 504 提示 |
| `list()` 开销随 Blob 数量增长 | 用量统计缓存 30s；`sweepExpired()` 每 5 分钟才跑一次 |
| GitHub Actions Cron 实际有 ~3-15min 漂移 | 读时惰性清理兜底，确保 410 始终正确 |
| 同 hash 并发合并重复工作 | 幂等 — 多做一次只是浪费带宽，结果一致 |
| Blob 公网 URL 没有 Referer 防护 | URL 含随机段，且 5 分钟即过期，足以应对临时分享场景 |

## 十二、首次部署 checklist

1. Vercel 项目导入 → Connect Git
2. **Storage** → Create Database → Vercel Blob → Connect to project
   （会自动注入 `BLOB_READ_WRITE_TOKEN`）
3. **Settings → Environment Variables** 添加 `CLEANUP_SECRET=<random-hex>`
4. 首次部署：`npm run deploy:preview` → 验证 → `npm run deploy`
5. GitHub 仓库 → Settings → Secrets → 新增 `CLEANUP_ENDPOINT` 和 `CLEANUP_SECRET`
6. 验证 `https://your-app.vercel.app/api/quota` 正常返回
7. 上传一张图片，等 5 分钟后访问 download URL 应返回 410
8. 手动触发一次清理：
   ```bash
   curl -X POST https://your-app.vercel.app/api/admin/cleanup \
     -H "Authorization: Bearer $CLEANUP_SECRET"
   ```

## 十三、验收

- [x] 本地 `npm start` 行为与改造前一致（fs 存储、24h TTL、定时清理）
- [x] `server` `tsc --noEmit` 通过
- [x] `client` `tsc --noEmit` 通过 + `vite build` 成功
- [x] `server` `tsc` 输出 `dist/server/src/app.js`，与 `api/index.ts` 引用路径一致
- [ ] Vercel preview 部署成功 → 上传/压缩/下载/过期/清理 全流程跑通（待手动验证）
