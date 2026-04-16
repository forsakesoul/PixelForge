import { useCallback, useRef, useState } from 'react';
import type { ToastItem, ToastType } from '../components/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((type: ToastType, message: string, duration?: number): number => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    return id;
  }, []);

  const close = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const update = useCallback((id: number, patch: Partial<Omit<ToastItem, 'id'>>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  return { toasts, show, close, update };
}
