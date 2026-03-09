/**
 * Loading Button Component
 * Provides visual feedback for async operations
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  spinnerPosition?: 'left' | 'right';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  children,
  loading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  spinnerPosition = 'left',
  disabled,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold tracking-wide rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  
  const variantStyles = {
    primary: 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/25 focus:ring-indigo-500/50 active:scale-[0.98] border border-white/10',
    secondary: 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 focus:ring-white/20',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 focus:ring-red-500',
    ghost: 'bg-transparent hover:bg-white/5 text-slate-400 hover:text-white focus:ring-white/10',
  };
  
  const sizeStyles = {
    sm: 'px-3 py-2 text-xs gap-1.5',
    md: 'px-4 py-3 text-sm gap-2',
    lg: 'px-4 py-3.5 text-sm gap-2',
  };

  const spinnerSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;
  
  const spinner = <Loader2 size={spinnerSizes[size]} className="animate-spin" aria-hidden="true" />;
  
  return (
    <button
      className={combinedClassName}
      disabled={disabled || loading}
      aria-busy={loading}
      aria-live="polite"
      {...props}
    >
      {loading ? (
        <>
          {spinnerPosition === 'left' && spinner}
          <span>{loadingText ?? children}</span>
          {spinnerPosition === 'right' && spinner}
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default LoadingButton;
