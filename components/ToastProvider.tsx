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

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(s => s.filter(t => t.id !== id));
    toastRefs.current.delete(id);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const toast: Toast = { id, message, type, duration };
    setToasts(s => [toast, ...s]);
    if (duration > 0) setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  // Announce to screen readers
  useEffect(() => {
    toasts.forEach(toast => {
      const el = toastRefs.current.get(toast.id);
      if (el) {
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', toast.type === 'error' ? 'assertive' : 'polite');
      }
    });
  }, [toasts]);

  const getToastStyles = (type: ToastType): string => {
    const base = 'max-w-sm w-full px-4 py-3 rounded-xl shadow-lg transform transition-all duration-200 ease-out border';
    switch (type) {
      case 'success':
        return `${base} bg-emerald-600/95 text-white border-emerald-700`;
      case 'error':
        return `${base} bg-red-600/95 text-white border-red-700`;
      case 'warning':
        return `${base} bg-amber-500/95 text-white border-amber-700`;
      default:
        return `${base} bg-slate-800/95 text-white border-slate-700`;
    }
  };

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container - aria-live region for screen readers */}
      <div 
        className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 items-end"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map(t => (
          <div 
            key={t.id} 
            ref={el => { if (el) toastRefs.current.set(t.id, el); }}
            className={getToastStyles(t.type)}
            role="alert"
          >
            <div className="flex items-start gap-3">
              <span className="font-bold" aria-hidden="true">{getToastIcon(t.type)}</span>
              <div className="flex-1 text-sm leading-tight break-words">{t.message}</div>
              <button 
                aria-label="Close notification" 
                onClick={() => removeToast(t.id)} 
                className="text-white/80 hover:text-white ml-2 p-1 rounded hover:bg-white/10 transition-colors"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
