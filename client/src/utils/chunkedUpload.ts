import type {
  ApiResponse,
  ChunkStatusResponse,
  ChunkUploadResponse,
  MergeChunksRequest,
  MergeChunksResponse,
  SupportedMimeType,
  UploadProgress,
  UploadStatus,
} from '@shared/types';

const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const MAX_RETRY = 3;

type ProgressCallback = (progress: UploadProgress) => void;

function createProgress(file: File, hash: string): UploadProgress {
  return {
    status: 'idle',
    hash,
    filename: file.name,
    fileSize: file.size,
    totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    uploadedChunks: 0,
    percentage: 0,
    speed: 0,
  };
}

function computeHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./hashWorker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      if (e.data.type === 'done') {
        resolve(e.data.hash);
        worker.terminate();
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };
    worker.postMessage(file);
  });
}

async function checkStatus(
  hash: string,
  totalChunks: number
): Promise<ChunkStatusResponse> {
  const params = new URLSearchParams({ hash, totalChunks: String(totalChunks) });
  const res = await fetch(`/api/upload/status?${params}`);
  const json: ApiResponse<ChunkStatusResponse> = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

async function uploadChunk(
  hash: string,
  index: number,
  chunk: Blob
): Promise<ChunkUploadResponse> {
  const formData = new FormData();
  formData.append('hash', hash);
  formData.append('index', String(index));
  formData.append('chunk', chunk);
  const res = await fetch('/api/upload/chunk', { method: 'POST', body: formData });
  const json: ApiResponse<ChunkUploadResponse> = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

async function uploadChunkWithRetry(
  hash: string,
  index: number,
  chunk: Blob
): Promise<ChunkUploadResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      return await uploadChunk(hash, index, chunk);
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError;
}

async function requestMerge(
  body: MergeChunksRequest
): Promise<MergeChunksResponse> {
  const res = await fetch('/api/upload/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: ApiResponse<MergeChunksResponse> = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

// 并发池
async function concurrentUpload(
  tasks: Array<{ index: number; chunk: Blob }>,
  hash: string,
  onChunkDone: () => void
): Promise<void> {
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await uploadChunkWithRetry(hash, task.index, task.chunk);
      onChunkDone();
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT, tasks.length) },
    () => next()
  );
  await Promise.all(workers);
}

export async function chunkedUpload(
  file: File,
  onProgress: ProgressCallback
): Promise<MergeChunksResponse> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let hash = '';
  const progress = createProgress(file, '');

  const updateStatus = (status: UploadStatus, extra?: Partial<UploadProgress>) => {
    progress.status = status;
    Object.assign(progress, extra);
    onProgress({ ...progress });
  };

  try {
    // 1. 计算 hash
    updateStatus('hashing');
    hash = await computeHash(file);
    progress.hash = hash;

    // 2. 查询已传分片
    updateStatus('checking');
    const status = await checkStatus(hash, totalChunks);

    if (status.isComplete) {
      updateStatus('complete', { uploadedChunks: totalChunks, percentage: 100 });
      return await requestMerge({
        hash,
        filename: file.name,
        totalChunks,
        fileSize: file.size,
        mimeType: file.type as SupportedMimeType,
      });
    }

    // 3. 切片 & 过滤已传
    const uploadedSet = new Set(status.uploadedChunks);
    const tasks: Array<{ index: number; chunk: Blob }> = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!uploadedSet.has(i)) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        tasks.push({ index: i, chunk: file.slice(start, end) });
      }
    }

    progress.uploadedChunks = uploadedSet.size;
    const startTime = Date.now();
    let uploadedBytes = uploadedSet.size * CHUNK_SIZE;

    // 4. 并发上传
    updateStatus('uploading');
    await concurrentUpload(tasks, hash, () => {
      progress.uploadedChunks++;
      uploadedBytes += CHUNK_SIZE;
      const elapsed = (Date.now() - startTime) / 1000;
      progress.percentage = Math.round(
        (progress.uploadedChunks / totalChunks) * 100
      );
      progress.speed = elapsed > 0 ? Math.round(uploadedBytes / elapsed) : 0;
      onProgress({ ...progress });
    });

    // 5. 合并
    updateStatus('merging', { percentage: 100 });
    const result = await requestMerge({
      hash,
      filename: file.name,
      totalChunks,
      fileSize: file.size,
      mimeType: file.type as SupportedMimeType,
    });

    updateStatus('complete');
    return result;
  } catch (err) {
    updateStatus('error', { errorMessage: (err as Error).message });
    throw err;
  }
}
