import { useState, useCallback, useRef } from 'react';
import { UploadArea } from './components/UploadArea';
import { CompressOptions } from './components/CompressOptions';
import { ImagePreview } from './components/ImagePreview';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';
import type {
  MergeChunksResponse,
  CompressRequest,
  CompressResponse,
  ApiResponse,
} from '@shared/types';

function App() {
  const [uploadInfo, setUploadInfo] = useState<MergeChunksResponse | null>(null);
  const [compressResult, setCompressResult] = useState<CompressResponse | null>(null);
  const [compressing, setCompressing] = useState(false);
  const { toasts, show, close, update } = useToast();
  const downloadToastIdRef = useRef<number>(0);

  const handleUploadStart = useCallback(
    (filename: string) => {
      show('info', `开始上传: ${filename}`);
    },
    [show]
  );

  const handleUploadComplete = useCallback(
    (result: MergeChunksResponse) => {
      setUploadInfo(result);
      setCompressResult(null);
      show('success', `上传成功: ${result.filename} (${formatSize(result.fileSize)})`);
    },
    [show]
  );

  const handleUploadError = useCallback(
    (message: string) => {
      show('error', `上传失败: ${message}`, 4000);
    },
    [show]
  );

  const handleCompress = async (request: CompressRequest) => {
    setCompressing(true);
    const toastId = show('loading', '正在压缩图片...', 0);

    try {
      const res = await fetch('/api/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const json: ApiResponse<CompressResponse> = await res.json();
      if (json.code !== 0) {
        update(toastId, { type: 'error', message: `压缩失败: ${json.message}`, duration: 3000 });
        return;
      }
      setCompressResult(json.data);
      const saved = ((1 - json.data.ratio) * 100).toFixed(1);
      update(toastId, {
        type: 'success',
        message: `压缩完成，体积减小 ${saved}% (${formatSize(json.data.compressedSize)})`,
        duration: 3000,
      });
    } catch (err) {
      update(toastId, { type: 'error', message: `请求失败: ${(err as Error).message}`, duration: 3000 });
    } finally {
      setCompressing(false);
    }
  };

  const handleDownloadStart = useCallback(() => {
    downloadToastIdRef.current = show('loading', '正在准备下载...', 0);
  }, [show]);

  const handleDownloadComplete = useCallback(() => {
    close(downloadToastIdRef.current);
    show('success', '下载完成');
  }, [show, close]);

  const handleDownloadError = useCallback(
    (message: string) => {
      close(downloadToastIdRef.current);
      show('error', `下载失败: ${message}`, 3000);
    },
    [show, close]
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      <Toast toasts={toasts} onClose={close} />

      <h1 style={{ textAlign: 'center', marginBottom: 32 }}>PixelForge</h1>

      <UploadArea
        onUploadComplete={handleUploadComplete}
        onUploadError={handleUploadError}
        onUploadStart={handleUploadStart}
      />

      {uploadInfo && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <CompressOptions
            fileId={uploadInfo.fileId}
            onCompress={handleCompress}
            loading={compressing}
          />
          <ImagePreview
            uploadInfo={uploadInfo}
            compressResult={compressResult}
            onDownloadStart={handleDownloadStart}
            onDownloadComplete={handleDownloadComplete}
            onDownloadError={handleDownloadError}
          />
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default App;
