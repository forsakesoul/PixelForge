# PixelForge 技术文档

## 一、技术选型

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | React | 18+ | UI 构建 |
| 构建工具 | Vite | 6+ | 开发/打包 |
| 后端框架 | Express | 4+ | HTTP 服务 |
| 语言 | TypeScript | 5+ | 全栈类型安全 |
| 图片处理 | sharp | 0.33+ | 高性能图片压缩 |
| 文件上传 | multer | 2+ | Express 文件上传中间件 |
| 文件哈希 | spark-md5 | 3.0+ | 浏览器端文件 hash 计算 |

## 二、共享类型定义 (`shared/types.ts`)

```typescript
// ========================
// 通用响应
// ========================
export interface ApiResponse<T = unknown> {
  code: number;        // 0=成功, 非0=失败
  message: string;
  data: T;
}

// ========================
// 分片上传相关
// ========================

export type SupportedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff';

export interface ChunkStatusRequest {
  hash: string;           // 文件内容 hash (MD5)
  totalChunks: number;    // 总分片数
}

export interface ChunkStatusResponse {
  uploadedChunks: number[];   // 已上传的分片索引列表
  isComplete: boolean;        // 文件是否已完整上传（秒传判断）
}

export interface ChunkUploadRequest {
  hash: string;           // 文件内容 hash
  index: number;          // 当前分片索引 (从 0 开始)
  chunk: File | Blob;     // 分片数据
}

export interface ChunkUploadResponse {
  index: number;          // 已接收的分片索引
}

export interface MergeChunksRequest {
  hash: string;           // 文件内容 hash
  filename: string;       // 原始文件名
  totalChunks: number;    // 总分片数
  fileSize: number;       // 原始文件总大小 (bytes)
  mimeType: SupportedMimeType;
}

export interface MergeChunksResponse {
  fileId: string;         // 服务端文件标识（用于后续压缩）
  filename: string;
  fileSize: number;
  width: number;          // 图片原始宽度
  height: number;         // 图片原始高度
  mimeType: string;
}

// ========================
// 图片压缩相关
// ========================

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export type CompressLevel = 'light' | 'standard' | 'high' | 'aggressive' | 'extreme';

export interface CompressLevelPreset {
  level: CompressLevel;
  label: string;
  description: string;
  quality: number;                  // sharp quality 参数 (1-100)
  resizeRatio: number;              // 尺寸缩放比例 (0-1, 1=不缩放)
  pngCompressionLevel: number;      // PNG 专用: 压缩级别 (0-9)
  webpEffort: number;               // WebP 专用: 编码力度 (0-6)
}

export interface CompressRequest {
  fileId: string;
  level: CompressLevel;
  format: OutputFormat;
  quality?: number;                 // 自定义质量 1-100（覆盖档位默认值）
  width?: number;                   // 指定输出宽度（覆盖 resizeRatio）
  height?: number;                  // 指定输出高度（覆盖 resizeRatio）
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface CompressResponse {
  compressedFileId: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;                    // 压缩率 (0-1, 如 0.35 表示压缩了 65%)
  width: number;
  height: number;
  format: OutputFormat;
  level: CompressLevel;
  previewUrl: string;
  downloadUrl: string;
}

export type UploadStatus = 'idle' | 'hashing' | 'checking' | 'uploading' | 'merging' | 'complete' | 'error';

export interface UploadProgress {
  status: UploadStatus;
  hash: string;
  filename: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: number;
  percentage: number;               // 0-100
  speed: number;                    // bytes/s
  errorMessage?: string;
}
```

## 三、API 接口详细设计

### 3.1 分片上传

#### `GET /api/upload/status` - 查询上传状态

查询指定文件已上传的分片列表，用于断点续传和秒传判断。

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| hash | query | string | Y | 文件 MD5 hash |
| totalChunks | query | number | Y | 总分片数 |

**响应**: `ApiResponse<ChunkStatusResponse>`

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "uploadedChunks": [0, 1, 2, 5],
    "isComplete": false
  }
}
```

---

#### `POST /api/upload/chunk` - 上传单个分片

**Content-Type**: `multipart/form-data`

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| hash | body | string | Y | 文件 MD5 hash |
| index | body | number | Y | 分片索引 (从 0 开始) |
| chunk | body | File | Y | 分片二进制数据 |

**响应**: `ApiResponse<ChunkUploadResponse>`

---

#### `POST /api/upload/merge` - 合并分片

**Content-Type**: `application/json`

**请求体**: `MergeChunksRequest`

**响应**: `ApiResponse<MergeChunksResponse>`

合并完成后会自动读取图片元信息（宽高）返回。

---

### 3.2 图片压缩

#### `POST /api/compress` - 压缩图片

**Content-Type**: `application/json`

**请求体**: `CompressRequest`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fileId | string | Y | 文件标识 |
| level | CompressLevel | Y | 压缩档位: `light` / `standard` / `high` / `aggressive` / `extreme` |
| format | OutputFormat | Y | 输出格式: `jpeg` / `png` / `webp` / `avif` |
| quality | number | N | 自定义质量 1-100（覆盖档位预设） |
| width | number | N | 自定义宽度（覆盖档位缩放比例） |
| height | number | N | 自定义高度（覆盖档位缩放比例） |
| fit | string | N | 缩放模式: `cover` / `contain` / `fill` / `inside` / `outside` |

**请求示例**:

```json
{
  "fileId": "a1b2c3d4",
  "level": "standard",
  "format": "webp"
}
```

```json
{
  "fileId": "a1b2c3d4",
  "level": "high",
  "format": "jpeg",
  "quality": 55,
  "width": 1920
}
```

**响应**: `ApiResponse<CompressResponse>`

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "compressedFileId": "a1b2c3d4_compressed",
    "originalSize": 8388608,
    "compressedSize": 2621440,
    "ratio": 0.31,
    "width": 4000,
    "height": 3000,
    "format": "webp",
    "level": "standard",
    "previewUrl": "/api/preview/a1b2c3d4_compressed",
    "downloadUrl": "/api/download/a1b2c3d4_compressed"
  }
}
```

---

#### `GET /api/download/:fileId` - 下载文件

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| fileId | path | string | Y | 文件标识 |
| type | query | string | N | `original` 或 `compressed`，默认 `compressed` |

**响应**: 文件流，`Content-Disposition: attachment`

---

#### `GET /api/preview/:fileId` - 预览图片

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| fileId | path | string | Y | 文件标识 |
| type | query | string | N | `original` 或 `compressed`，默认 `compressed` |

**响应**: 图片流，`Content-Type: image/*`

## 四、压缩档位设计

### 4.1 五档压缩参数对照表

以一张 **4000x3000 JPEG (8MB)** 图片为例，各档位预期效果：

| 档位 | 标识 | quality | 尺寸缩放 | PNG 压缩级 | WebP effort | 预期输出大小 | 预期压缩率 |
|------|------|---------|---------|-----------|-------------|------------|-----------|
| 轻度压缩 | `light` | 90 | 100% (4000x3000) | 3 | 2 | ~4.5MB | ~56% |
| 标准压缩 | `standard` | 75 | 100% (4000x3000) | 6 | 4 | ~2.5MB | ~31% |
| 较强压缩 | `high` | 60 | 100% (4000x3000) | 7 | 5 | ~1.5MB | ~19% |
| 强力压缩 | `aggressive` | 40 | 80% (3200x2400) | 8 | 6 | ~600KB | ~7% |
| 极限压缩 | `extreme` | 20 | 60% (2400x1800) | 9 | 6 | ~250KB | ~3% |

> 预期数据为 JPEG 格式估算，实际因图片内容差异较大。PNG/WebP 另有对应参数。

### 4.2 各格式压缩参数映射

不同输出格式使用不同的 sharp 参数：

```typescript
function buildSharpOptions(preset: CompressLevelPreset, format: OutputFormat) {
  switch (format) {
    case 'jpeg':
      return { quality: preset.quality, mozjpeg: true };
    case 'png':
      return { compressionLevel: preset.pngCompressionLevel, palette: preset.quality < 50 };
    case 'webp':
      return { quality: preset.quality, effort: preset.webpEffort };
    case 'avif':
      return { quality: preset.quality, effort: Math.min(preset.webpEffort, 4) };
  }
}
```

### 4.3 优先级规则

用户可以同时选择**档位**和**自定义参数**，优先级如下：

```
自定义 quality  > 档位预设 quality
自定义 width/height > 档位预设 resizeRatio
未传自定义参数时 → 完全使用档位预设值
```

前端 UI：默认展示 5 个档位按钮，选中后展示预设值；点击「高级选项」可展开手动调整 quality / 尺寸。

## 五、断点续传方案

### 5.1 整体流程

```
┌──────────────────────────────────────────────────────────────────┐
│  前端                                                            │
│                                                                  │
│  1. 用户选择/拖拽文件                                             │
│  2. Web Worker 计算文件 MD5 hash（避免阻塞 UI）                   │
│  3. 按 CHUNK_SIZE(2MB) 切分为 N 个分片                            │
│  4. GET /api/upload/status → 获取已上传分片列表                    │
│     ├─ isComplete=true  → 秒传，直接跳到步骤 7                    │
│     └─ isComplete=false → 过滤已传分片，继续上传                   │
│  5. 并发上传剩余分片（并发数=3，失败自动重试 3 次）                 │
│  6. 全部分片上传完成 → POST /api/upload/merge                     │
│  7. 上传完成，拿到 fileId → 进入压缩流程                          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  后端                                                            │
│                                                                  │
│  chunks/<hash>/                                                  │
│     ├── chunk-0     ← 每个分片单独存储                            │
│     ├── chunk-1                                                  │
│     └── ...                                                      │
│                                                                  │
│  合并流程:                                                        │
│     读取 chunk-0..N-1 → 按顺序写入 uploads/<hash>_<filename>     │
│     → 校验文件大小 → 读取图片元信息 → 删除 chunks/<hash>/         │
│     → 返回 MergeChunksResponse                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 关键参数

```typescript
// 前端配置
const CHUNK_SIZE = 2 * 1024 * 1024;     // 分片大小: 2MB
const MAX_CONCURRENT = 3;               // 最大并发上传数
const MAX_RETRY = 3;                    // 单个分片最大重试次数

// 后端配置
const MULTER_MAX_SIZE = 3 * 1024 * 1024;// multer 单次接收上限 (略大于 CHUNK_SIZE)
const CHUNK_EXPIRE_HOURS = 24;          // 分片过期时间
const MAX_FILE_SIZE = 100 * 1024 * 1024;// 单文件最大 100MB
```

### 5.3 Web Worker Hash 计算

```typescript
// hashWorker.ts - 在 Worker 线程中运行
// 分块读取文件 → 增量计算 MD5 → 避免一次性加载到内存
// 定期 postMessage 发送进度 → 主线程更新 UI
```

## 六、踩坑点与解决方案

### 6.1 前端

| # | 问题 | 原因 | 解决方案 |
|---|------|------|----------|
| 1 | 大文件 hash 计算卡死页面 | 主线程计算 hash 阻塞渲染 | **Web Worker** 中分块增量计算 MD5 |
| 2 | 上传进度不准确 | 只统计分片数不够精确 | 用 `XMLHttpRequest.upload.onprogress` 或 fetch + ReadableStream 统计字节级进度 |
| 3 | 浏览器并发限制 | 同域名最多 6 个 TCP 连接 | 并发数控制在 3，预留连接给其他请求 |
| 4 | 页面刷新丢失上传状态 | 内存中的 hash/进度丢失 | 将 hash + 已传分片信息存 **localStorage**，刷新后恢复 |
| 5 | Vite dev 跨域 | 前端 5173 → 后端 3001 | `vite.config.ts` 配置 `server.proxy` |

### 6.2 后端

| # | 问题 | 原因 | 解决方案 |
|---|------|------|----------|
| 1 | 分片合并顺序错误 | 文件系统遍历不保证顺序 | 文件名含 index，合并时 **parseInt 排序** |
| 2 | 合并大文件内存溢出 | `readFileSync` 一次性读入 | 使用 **Stream** 流式读写合并 |
| 3 | 僵尸分片占用磁盘 | 上传中断后分片未清理 | **定时任务** (setInterval) 扫描清理超时分片 |
| 4 | multer 拒绝分片 | 默认 fileSize 限制 1MB | 配置 `limits.fileSize` 略大于 CHUNK_SIZE |
| 5 | sharp 处理 GIF 丢帧 | sharp 不支持动画 GIF | 检测 GIF 返回提示，或仅处理首帧并告知用户 |
| 6 | sharp 大图内存溢出 | 超大分辨率解码占内存 | 设置 `sharp.limitInputPixels` 上限 |
| 7 | 压缩后文件更大 | 格式转换 / 低压缩率 | 对比大小，若压缩后更大返回 `ratio > 1` 提示用户 |
| 8 | EXIF 方向丢失 | 压缩后图片旋转异常 | sharp 默认 `rotate()` 自动校正 EXIF 方向 |
| 9 | 并发合并竞态 | 同一文件多次触发合并 | 合并前加 **文件锁**（简单方案：内存 Map 标记） |

### 6.3 TypeScript 相关

| # | 问题 | 解决方案 |
|---|------|----------|
| 1 | 前后端类型不同步 | `shared/types.ts` 共享，通过 tsconfig paths 引用 |
| 2 | multer req.file 类型缺失 | 安装 `@types/multer`，使用 `Express.Multer.File` |
| 3 | Express 路由类型不严格 | 用泛型封装 `TypedRequestBody<T>` / `TypedRequestQuery<T>` |

### 6.4 压缩档位相关

| # | 问题 | 说明 | 解决方案 |
|---|------|------|----------|
| 1 | PNG quality 参数无效 | sharp 的 PNG 不支持 quality，用 compressionLevel (0-9) | 按格式分别映射，PNG 用 `pngCompressionLevel` |
| 2 | aggressive/extreme 缩放后尺寸为奇数 | 某些编码器要求偶数尺寸 | 缩放后 `Math.round` 并确保偶数：`Math.round(w) & ~1` |
| 3 | 极限压缩画质差但文件不小 | PNG 无损格式即使 compressionLevel=9 也不会很小 | 极限档位建议用户切换到 JPEG/WebP 有损格式 |
| 4 | AVIF 编码慢 | AVIF effort 越高越慢，大图可能超时 | AVIF effort 上限 4，超时兜底设 30s |
