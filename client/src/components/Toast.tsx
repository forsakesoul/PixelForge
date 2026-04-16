import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration?: number; // ms, 0 = 不自动关闭
}

interface Props {
  toasts: ToastItem[];
  onClose: (id: number) => void;
}

const TYPE_STYLES: Record<ToastType, { bg: string; color: string; icon: string }> = {
  success: { bg: '#f6ffed', color: '#52c41a', icon: '✓' },
  error:   { bg: '#fff2f0', color: '#ff4d4f', icon: '✕' },
  info:    { bg: '#e6f7ff', color: '#1890ff', icon: 'ℹ' },
  loading: { bg: '#fffbe6', color: '#faad14', icon: '◌' },
};

export function Toast({ toasts, onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
}

function ToastRow({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const style = TYPE_STYLES[toast.type];

  useEffect(() => {
    if (toast.duration === 0) return;
    const timer = setTimeout(() => onClose(toast.id), toast.duration ?? 2500);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onClose]);

  return (
    <div
      style={{
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.color}40`,
        padding: '10px 20px',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 240,
        maxWidth: 480,
        pointerEvents: 'auto',
        animation: 'toast-slide-down 0.3s ease',
      }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          display: 'inline-block',
          animation: toast.type === 'loading' ? 'toast-spin 1s linear infinite' : undefined,
        }}
      >
        {style.icon}
      </span>
      <span style={{ flex: 1, fontSize: 14 }}>{toast.message}</span>
      <style>{`
        @keyframes toast-slide-down {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes toast-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
