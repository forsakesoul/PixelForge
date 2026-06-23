import { useEffect, useState } from 'react';
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
  const expiresAt = compressResult?.expiresAt ?? 0;
  const remainMs = useCountdown(expiresAt);
  const expired = expiresAt > 0 && remainMs <= 0;

  const handleDownload = async () => {
    if (!compressResult || downloadState === 'downloading') return;
    if (expired) {
      onDownloadError?.('文件已过期，请重新压缩');
      return;
    }

    setDownloadState('downloading');
    onDownloadStart?.();

    try {
      const res = await fetch(compressResult.downloadUrl);
      if (res.status === 410) throw new Error('文件已过期');
      if (!res.ok) throw new Error(`下载失败 (${res.status})`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      const ext = compressResult.format === 'jpeg' ? 'jpg' : compressResult.format;
      const baseName = uploadInfo.filename.replace(/\.[^.]+$/, '');
      a.download = `${baseName}_compressed.${ext}`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);

      setDownloadState('done');
      onDownloadComplete?.();
      setTimeout(() => setDownloadState('idle'), 2000);
    } catch (err) {
      setDownloadState('error');
      onDownloadError?.((err as Error).message);
      setTimeout(() => setDownloadState('idle'), 2000);
    }
  };

  const downloadBtnText = () => {
    if (expired) return '已过期';
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
      cursor: downloadState === 'downloading' || expired ? 'not-allowed' : 'pointer',
      fontSize: 14,
      fontWeight: 600,
      transition: 'all 0.2s',
      opacity: expired ? 0.5 : 1,
    };
    if (expired) return { ...base, background: '#bfbfbf' };
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
              {expiresAt > 0 && (
                <p style={{ color: expired ? '#ff4d4f' : '#faad14', fontWeight: 600 }}>
                  {expired ? '文件已过期' : `剩余 ${formatRemain(remainMs)} 后过期`}
                </p>
              )}
            </div>
            <button
              onClick={handleDownload}
              disabled={downloadState === 'downloading' || expired}
              style={downloadBtnStyle()}
            >
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

function formatRemain(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useCountdown(targetMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (targetMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return targetMs > 0 ? targetMs - now : 0;
}
