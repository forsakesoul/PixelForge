# PixelForge

> A local-first media toolkit. Compress, transform, and forge your images with ease.

PixelForge 是一个本地优先的媒体处理工具箱，基于 React + Express + TypeScript 构建。当前提供图片压缩能力，支持大文件断点续传、5 档压缩精度、多格式输出。

## Features

- **断点续传** - 大文件分片上传，中断后可恢复，支持秒传
- **5 档压缩** - 从轻度到极限，覆盖存档、日常、网页、移动端等场景
- **多格式输出** - JPEG / PNG / WebP / AVIF
- **实时预览** - 压缩前后对比，显示压缩率与尺寸变化
- **高级自定义** - 可覆盖档位预设的 quality、宽高等参数
- **全栈 TypeScript** - 前后端共享类型定义，接口类型安全

## Quick Start

```bash
# 安装依赖
cd client && npm install && cd ../server && npm install && cd ..

# 开发模式（前后端同时启动）
npm start

# 访问
open http://localhost:5173
```

## Scripts

| 命令 | 说明 |
|------|------|
| `npm start` | 同时启动前后端开发服务 |
| `npm run client:dev` | 仅启动前端 (Vite :5173) |
| `npm run server:dev` | 仅启动后端 (Express :3001) |
| `npm run build` | 构建前端 + 编译后端 |
| `npm run serve` | 启动生产模式 (单端口 :3001) |

## Tech Stack

| 层级 | 技术 |
|------|------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Express + sharp + multer |
| Shared | TypeScript types (`shared/types.ts`) |

## Project Structure

```
PixelForge/
├── shared/types.ts          # 前后端共享类型与压缩预设
├── client/src/              # React 前端
│   ├── components/          # UploadArea, CompressOptions, ImagePreview, Toast
│   ├── hooks/               # useToast
│   └── utils/               # chunkedUpload, hashWorker (Web Worker)
├── server/src/              # Express 后端
│   ├── routes/              # upload (分片上传), compress (压缩/预览/下载)
│   ├── services/            # chunkService (分片管理), compressService (压缩)
│   └── middleware/          # errorHandler
└── docs/                    # 技术文档
    └── technical.md
```

## Documentation

详细技术文档见 [docs/technical.md](docs/technical.md)，包含：

- API 接口定义（请求/响应/示例）
- 共享类型定义
- 压缩档位参数对照表
- 断点续传方案设计
- 踩坑点与解决方案

## Contributors

| | Name | Role |
|---|------|------|
| <img src="https://github.com/forsakesoul.png" width="40" /> | [@forsakesoul](https://github.com/forsakesoul) | Creator |
| <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Anthropic_logo.svg/180px-Anthropic_logo.svg.png" width="40" /> | Claude Code (Opus 4.6) | AI Pair Programmer |

> Built with [Claude Code](https://claude.ai/claude-code) - Anthropic's AI coding assistant.

## License

[MIT](LICENSE)
