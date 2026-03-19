import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'error' | 'warning';
type Toast = { id: string; message: string; type?: ToastType; duration?: number };

type ToastContextValue = {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

const STYLES: Record<ToastType, { container: string; icon: string; progress: string }> = {
  success: {
    container: 'bg-white border border-emerald-200 shadow-lg shadow-emerald-100/50',
    icon: 'bg-emerald-100 text-emerald-600',
    progress: 'bg-emerald-500',
  },
  error: {
    container: 'bg-white border border-red-200 shadow-lg shadow-red-100/50',
    icon: 'bg-red-100 text-red-600',
    progress: 'bg-red-500',
  },
  warning: {
    container: 'bg-white border border-amber-200 shadow-lg shadow-amber-100/50',
    icon: 'bg-amber-100 text-amber-600',
    progress: 'bg-amber-500',
  },
  info: {
    container: 'bg-white border border-blue-200 shadow-lg shadow-blue-100/50',
    icon: 'bg-blue-100 text-blue-600',
    progress: 'bg-blue-500',
  },
};

const TEXT_COLOR: Record<ToastType, string> = {
  success: 'text-emerald-800',
  error: 'text-red-800',
  warning: 'text-amber-800',
  info: 'text-blue-800',
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const type = toast.type ?? 'info';
  const duration = toast.duration ?? 4500;
  const style = STYLES[type];
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Trigger slide-in on mount
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (duration <= 0) return;
    const step = 50;
    const decrement = (step / duration) * 100;
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        const next = p - decrement;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return next;
      });
    }, step);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [duration]);

  return (
    <div
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`
        relative w-80 rounded-xl overflow-hidden
        ${style.container}
        transition-all duration-300 ease-out
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}
      `}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Icon */}
        <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${style.icon}`}>
          {ICONS[type]}
        </span>

        {/* Message */}
        <p className={`flex-1 text-sm font-medium leading-snug pt-1 ${TEXT_COLOR[type]}`}>
          {toast.message}
        </p>

        {/* Close */}
        <button
          aria-label="Dismiss notification"
          onClick={() => onRemove(toast.id)}
          className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="h-0.5 w-full bg-slate-100">
          <div
            className={`h-full ${style.progress} transition-none`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(s => s.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(s => [{ id, message, type, duration }, ...s]);
    if (duration > 0) setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-6 right-6 z-[9999] flex flex-col gap-2 items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
