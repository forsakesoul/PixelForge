import { useEffect, useState } from 'react';
import type { QuotaResponse } from '@shared/types';
import { fetchQuota } from '../utils/chunkedUpload';

interface Props {
  refreshKey?: number;
}

export function QuotaBar({ refreshKey = 0 }: Props) {
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuota(0)
      .then((q) => {
        if (!cancelled) {
          setQuota(q);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) {
    return (
      <div style={barWrap}>
        <span style={{ color: '#ff4d4f', fontSize: 12 }}>无法获取存储用量: {error}</span>
      </div>
    );
  }
  if (!quota) {
    return (
      <div style={barWrap}>
        <span style={{ color: '#999', fontSize: 12 }}>加载存储用量...</span>
      </div>
    );
  }

  const used = formatBytes(quota.usedBytes);
  const limit = formatBytes(quota.limitBytes);
  const ratio = Math.round(quota.usedRatio * 100);
  const ttlMin = Math.round(quota.fileTtlMs / 1000 / 60);
  const driverLabel = quota.driver === 'blob' ? 'Vercel Blob' : '本地磁盘';
  const danger = quota.usedRatio >= 0.85;

  return (
    <div style={barWrap}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#666',
          marginBottom: 4,
        }}
      >
        <span>
          剩余空间 ({driverLabel}，文件保留 {ttlMin} 分钟)
        </span>
        <span style={{ color: danger ? '#ff4d4f' : '#666' }}>
          {used} / {limit}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 6,
          background: '#f0f0f0',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${ratio}%`,
            height: '100%',
            background: danger ? '#ff4d4f' : '#1890ff',
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}

const barWrap: React.CSSProperties = {
  margin: '12px 0',
  padding: '8px 12px',
  background: '#fafafa',
  borderRadius: 6,
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
