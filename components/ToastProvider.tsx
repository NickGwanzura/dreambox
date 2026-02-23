import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

  const removeToast = useCallback((id: string) => {
    setToasts(s => s.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const toast: Toast = { id, message, type, duration };
    setToasts(s => [toast, ...s]);
    if (duration > 0) setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 items-end">
        {toasts.map(t => (
          <div key={t.id} className={`max-w-sm w-full px-4 py-3 rounded-xl shadow-lg transform transition-all duration-200 ease-out border ${t.type === 'success' ? 'bg-emerald-600/95 text-white border-emerald-700' : t.type === 'error' ? 'bg-red-600/95 text-white border-red-700' : t.type === 'warning' ? 'bg-amber-500/95 text-white border-amber-700' : 'bg-slate-800/95 text-white border-slate-700'}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 text-sm leading-tight break-words">{t.message}</div>
              <button aria-label="Close" onClick={() => removeToast(t.id)} className="text-white/80 hover:text-white ml-2">✕</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
