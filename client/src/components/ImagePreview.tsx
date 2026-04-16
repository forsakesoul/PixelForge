import { useState } from 'react';
import type { CompressResponse, MergeChunksResponse } from '@shared/types';

type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

interface Props {
  uploadInfo: MergeChunksResponse;
  compressResult: CompressResponse | null;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDownloadError?: (message: string) => void;
}

export function ImagePreview({
  uploadInfo,
  compressResult,
  onDownloadStart,
  onDownloadComplete,
  onDownloadError,
}: Props) {
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');

  const handleDownload = async () => {
    if (!compressResult || downloadState === 'downloading') return;

    setDownloadState('downloading');
    onDownloadStart?.();

    try {
      const res = await fetch(compressResult.downloadUrl);
      if (!res.ok) throw new Error(`下载失败 (${res.status})`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      // 拼接下载文件名：原始文件名 + _compressed + 扩展名
      const ext = compressResult.format === 'jpeg' ? 'jpg' : compressResult.format;
      const baseName = uploadInfo.filename.replace(/\.[^.]+$/, '');
      a.download = `${baseName}_compressed.${ext}`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);

      setDownloadState('done');
      onDownloadComplete?.();
      // 2s 后恢复 idle，允许重复下载
      setTimeout(() => setDownloadState('idle'), 2000);
    } catch (err) {
      setDownloadState('error');
      onDownloadError?.((err as Error).message);
      setTimeout(() => setDownloadState('idle'), 2000);
    }
  };

  const downloadBtnText = () => {
    switch (downloadState) {
      case 'downloading': return '下载中...';
      case 'done': return '下载完成';
      case 'error': return '下载失败';
      default: return '下载压缩图';
    }
  };

  const downloadBtnStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      marginTop: 8,
      padding: '8px 24px',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      cursor: downloadState === 'downloading' ? 'wait' : 'pointer',
      fontSize: 14,
      fontWeight: 600,
      transition: 'all 0.2s',
    };
    switch (downloadState) {
      case 'downloading': return { ...base, background: '#faad14' };
      case 'done':        return { ...base, background: '#52c41a' };
      case 'error':       return { ...base, background: '#ff4d4f' };
      default:            return { ...base, background: '#52c41a' };
    }
  };

  return (
    <div style={{ padding: 20, border: '1px solid #e8e8e8', borderRadius: 8 }}>
      <h3 style={{ marginTop: 0 }}>预览对比</h3>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* 原图 */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <h4>原图</h4>
          <img
            src={`/api/preview/${uploadInfo.fileId}?type=original`}
            alt="original"
            style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4 }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            <p>文件名: {uploadInfo.filename}</p>
            <p>尺寸: {uploadInfo.width} x {uploadInfo.height}</p>
            <p>大小: {formatSize(uploadInfo.fileSize)}</p>
          </div>
        </div>

        {/* 压缩后 */}
        {compressResult && (
          <div style={{ flex: 1, minWidth: 240 }}>
            <h4>压缩后</h4>
            <img
              src={compressResult.previewUrl}
              alt="compressed"
              style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4 }}
            />
            <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
              <p>
                格式: {compressResult.format.toUpperCase()} | 档位: {compressResult.level}
              </p>
              <p>尺寸: {compressResult.width} x {compressResult.height}</p>
              <p>大小: {formatSize(compressResult.compressedSize)}</p>
              <p
                style={{
                  fontWeight: 600,
                  color: compressResult.ratio <= 1 ? '#52c41a' : '#ff4d4f',
                }}
              >
                {compressResult.ratio <= 1
                  ? `压缩了 ${((1 - compressResult.ratio) * 100).toFixed(1)}%`
                  : `文件增大了 ${((compressResult.ratio - 1) * 100).toFixed(1)}%（建议换格式或调高压缩档位）`}
              </p>
            </div>
            <button onClick={handleDownload} disabled={downloadState === 'downloading'} style={downloadBtnStyle()}>
              {downloadBtnText()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
