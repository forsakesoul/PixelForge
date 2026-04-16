import { useCallback, useState, useRef } from 'react';
import type { UploadProgress, MergeChunksResponse } from '@shared/types';

interface Props {
  onUploadComplete: (result: MergeChunksResponse) => void;
  onUploadError?: (message: string) => void;
  onUploadStart?: (filename: string) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/tiff';

export function UploadArea({ onUploadComplete, onUploadError, onUploadStart }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      onUploadStart?.(file.name);

      const { chunkedUpload } = await import('../utils/chunkedUpload');
      try {
        const result = await chunkedUpload(file, (p) => setProgress({ ...p }));
        onUploadComplete(result);
      } catch (err) {
        onUploadError?.((err as Error).message || '上传失败');
      }
    },
    [onUploadComplete, onUploadError, onUploadStart]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const statusText = () => {
    if (!progress) return null;
    switch (progress.status) {
      case 'hashing':
        return '正在计算文件指纹...';
      case 'checking':
        return '正在检查上传状态...';
      case 'uploading':
        return `上传中 ${progress.percentage}% (${formatSpeed(progress.speed)})`;
      case 'merging':
        return '正在合并文件...';
      case 'complete':
        return '上传完成';
      case 'error':
        return `上传失败: ${progress.errorMessage}`;
      default:
        return null;
    }
  };

  const isUploading =
    progress &&
    !['idle', 'complete', 'error'].includes(progress.status);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? '#1890ff' : '#d9d9d9'}`,
        borderRadius: 8,
        padding: 40,
        textAlign: 'center',
        cursor: isUploading ? 'default' : 'pointer',
        background: dragOver ? '#e6f7ff' : '#fafafa',
        transition: 'all 0.2s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files);
          // 重置 input，允许重新选择相同文件
          e.target.value = '';
        }}
      />

      {!progress || progress.status === 'idle' ? (
        <div>
          <div style={{ fontSize: 40, color: '#999' }}>+</div>
          <p>点击或拖拽图片到此处上传</p>
          <p style={{ fontSize: 12, color: '#999' }}>
            支持 JPEG、PNG、WebP、AVIF、GIF、BMP、TIFF
          </p>
        </div>
      ) : (
        <div>
          <p>{statusText()}</p>
          {progress.status === 'uploading' && (
            <div style={{ marginTop: 12 }}>
              <ProgressBarInline percentage={progress.percentage} />
              <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {progress.uploadedChunks}/{progress.totalChunks} 分片
              </p>
            </div>
          )}
          {progress.status === 'error' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProgress(null);
              }}
              style={{ marginTop: 8 }}
            >
              重新上传
            </button>
          )}
          {progress.status === 'complete' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProgress(null);
                inputRef.current?.click();
              }}
              style={{ marginTop: 8 }}
            >
              重新选择
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBarInline({ percentage }: { percentage: number }) {
  return (
    <div
      style={{
        width: '100%',
        height: 8,
        background: '#f0f0f0',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${percentage}%`,
          height: '100%',
          background: '#1890ff',
          borderRadius: 4,
          transition: 'width 0.2s',
        }}
      />
    </div>
  );
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}
