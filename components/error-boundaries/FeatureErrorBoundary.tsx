/**
 * Feature-level Error Boundaries
 * Isolates errors to specific features rather than crashing the entire app
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '../../utils/logger';

interface Props {
  children: React.ReactNode;
  featureName: string;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class FeatureErrorBoundary extends React.Component<Props, State> {
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(`Error in ${(this as any).props.featureName}:`, error, errorInfo);
  }

  render() {
    const self = this as any;
    const { children, featureName, fallback, onReset } = self.props;
    const { hasError, error } = self.state;
    
    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="p-8 bg-white rounded-3xl shadow-lg border border-slate-100">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {featureName} Error
            </h3>
            
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              Something went wrong in the {featureName.toLowerCase()} section. 
              Try refreshing or go back to the dashboard.
            </p>
            
            {error && (
              <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left max-w-lg mx-auto">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Error Details</p>
                <code className="text-xs text-red-600 block overflow-x-auto">
                  {error.message}
                </code>
              </div>
            )}
            
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  self.setState({ hasError: false, error: undefined });
                  onReset?.();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-medium text-sm hover:bg-slate-800 transition-colors"
              >
                <RefreshCw size={16} />
                Try Again
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors"
              >
                <RefreshCw size={16} />
                Reload Page
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
              >
                <Home size={16} />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * HOC for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  featureName: string,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <FeatureErrorBoundary featureName={featureName} fallback={fallback}>
        <WrappedComponent {...props} />
      </FeatureErrorBoundary>
    );
  };
}
