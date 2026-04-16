import { useState } from 'react';
import type { CompressLevel, OutputFormat, CompressRequest } from '@shared/types';
import { COMPRESS_LEVEL_PRESETS } from '@shared/types';

interface Props {
  fileId: string;
  onCompress: (request: CompressRequest) => void;
  loading: boolean;
}

const LEVELS: CompressLevel[] = ['light', 'standard', 'high', 'aggressive', 'extreme'];
const FORMATS: OutputFormat[] = ['jpeg', 'png', 'webp', 'avif'];

export function CompressOptions({ fileId, onCompress, loading }: Props) {
  const [level, setLevel] = useState<CompressLevel>('standard');
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customQuality, setCustomQuality] = useState<string>('');
  const [customWidth, setCustomWidth] = useState<string>('');
  const [customHeight, setCustomHeight] = useState<string>('');

  const preset = COMPRESS_LEVEL_PRESETS[level];

  const handleCompress = () => {
    const req: CompressRequest = { fileId, level, format };
    if (customQuality) req.quality = parseInt(customQuality, 10);
    if (customWidth) req.width = parseInt(customWidth, 10);
    if (customHeight) req.height = parseInt(customHeight, 10);
    onCompress(req);
  };

  return (
    <div style={{ padding: 20, border: '1px solid #e8e8e8', borderRadius: 8 }}>
      <h3 style={{ marginTop: 0 }}>压缩设置</h3>

      {/* 档位选择 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
          压缩档位
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LEVELS.map((l) => {
            const p = COMPRESS_LEVEL_PRESETS[l];
            return (
              <button
                key={l}
                onClick={() => setLevel(l)}
                style={{
                  padding: '8px 16px',
                  border: level === l ? '2px solid #1890ff' : '1px solid #d9d9d9',
                  borderRadius: 6,
                  background: level === l ? '#e6f7ff' : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                  Q:{p.quality} {p.resizeRatio < 1 ? `| ${p.resizeRatio * 100}%` : ''}
                </div>
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          {preset.description}
        </p>
      </div>

      {/* 输出格式 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
          输出格式
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                padding: '6px 16px',
                border: format === f ? '2px solid #1890ff' : '1px solid #d9d9d9',
                borderRadius: 6,
                background: format === f ? '#e6f7ff' : '#fff',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 高级选项 */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            color: '#1890ff',
            cursor: 'pointer',
            padding: 0,
            fontSize: 13,
          }}
        >
          {showAdvanced ? '收起' : '展开'}高级选项
        </button>

        {showAdvanced && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#fafafa',
              borderRadius: 6,
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>
                自定义质量 (1-100)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={customQuality}
                onChange={(e) => setCustomQuality(e.target.value)}
                placeholder={String(preset.quality)}
                style={{ display: 'block', width: 80, marginTop: 4, padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>宽度 (px)</label>
              <input
                type="number"
                min={1}
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                placeholder="自动"
                style={{ display: 'block', width: 80, marginTop: 4, padding: '4px 8px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>高度 (px)</label>
              <input
                type="number"
                min={1}
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                placeholder="自动"
                style={{ display: 'block', width: 80, marginTop: 4, padding: '4px 8px' }}
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleCompress}
        disabled={loading}
        style={{
          padding: '10px 32px',
          background: loading ? '#d9d9d9' : '#1890ff',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: loading ? 'default' : 'pointer',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {loading ? '压缩中...' : '开始压缩'}
      </button>
    </div>
  );
}
