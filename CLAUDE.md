# CLAUDE.md

This file provides context for Claude Code when working on the PixelForge project.

## Project Overview

PixelForge is a local-first media toolkit for image compression. It uses a React frontend and Express backend, both written in TypeScript. The project supports chunked file uploads with resume capability and 5-level image compression.

## Architecture

```
shared/types.ts        ← Single source of truth for all types & compress presets
client/                ← React 18 + Vite frontend
server/                ← Express + sharp backend
```

Frontend and backend share types via `shared/types.ts`, referenced through tsconfig `paths` alias `@shared/*`.

## Key Files

- `shared/types.ts` - All API interfaces, compress level presets, upload types
- `server/src/index.ts` - Express entry point, creates upload/chunk/compressed dirs, cleanup timer
- `server/src/routes/upload.ts` - Chunk upload routes (status/chunk/merge)
- `server/src/routes/compress.ts` - Compress/preview/download routes
- `server/src/services/chunkService.ts` - Chunk storage, merge with streams
- `server/src/services/compressService.ts` - sharp-based compression, format-specific options
- `client/src/App.tsx` - Main page, orchestrates upload → compress → preview flow
- `client/src/utils/chunkedUpload.ts` - Client-side chunked upload with concurrency pool & retry
- `client/src/utils/hashWorker.ts` - Web Worker for MD5 hash computation (spark-md5)
- `client/src/components/Toast.tsx` - Notification system (success/error/info/loading)
- `client/src/hooks/useToast.ts` - Toast state management hook

## Tech Stack

- **Frontend**: React 18, Vite 6, TypeScript 5, spark-md5
- **Backend**: Express 4, sharp, multer, tsx (dev runner)
- **No CSS framework** - inline styles only

## Development Commands

```bash
npm start          # Run both client (5173) and server (3001) in dev mode
npm run build      # Build client + compile server
npm run serve      # Production mode (server serves client/dist on :3001)
```

## Conventions

- All API responses use `ApiResponse<T>` wrapper: `{ code, message, data }`
- `code: 0` = success, non-zero = error
- File identification uses MD5 hash of file content (computed client-side via Web Worker)
- Uploaded files stored as `uploads/<hash>_<filename>`, chunks in `chunks/<hash>/chunk-<index>`
- Compressed files stored in `compressed/<fileId>_<level>_<timestamp>.<ext>`
- Server uses ESM (`"type": "module"` in package.json)
- No test framework configured yet

## Compression Levels

5 presets defined in `COMPRESS_LEVEL_PRESETS` (shared/types.ts):

| Level | Quality | Resize |
|-------|---------|--------|
| light | 90 | 100% |
| standard | 75 | 100% |
| high | 60 | 100% |
| aggressive | 40 | 80% |
| extreme | 20 | 60% |

Custom quality/width/height can override preset values per request.

## Important Patterns

- **Chunked upload**: file → Web Worker MD5 hash → check server for existing chunks → upload remaining → merge
- **Merge lock**: in-memory Set prevents concurrent merge of same file
- **Stream merge**: chunks merged via `createReadStream` pipe to avoid memory issues
- **Toast via ref**: download toast ID tracked with `useRef` to avoid stale closure issues in `useCallback`
- **Cleanup timer**: server runs hourly cleanup of chunk dirs older than 24h
