/**
 * Safe Async Hook
 * Prevents state updates on unmounted components and handles errors gracefully
 */

import { useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { logger } from './logger';

interface UseSafeAsyncOptions {
  onError?: (error: Error) => void;
  ignoreAbort?: boolean;
}

export function useSafeAsync(options: UseSafeAsyncOptions = {}) {
  const { onError, ignoreAbort = true } = options;
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const run = useCallback(async <T,>(
    asyncFn: (signal: AbortSignal) => Promise<T>,
    onSuccess?: (data: T) => void
  ): Promise<T | undefined> => {
    // Cancel any previous operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await asyncFn(controller.signal);
      
      if (isMountedRef.current) {
        onSuccess?.(result);
        return result;
      }
    } catch (error) {
      if (error instanceof Error) {
        // Ignore abort errors unless configured otherwise
        if (error.name === 'AbortError' && ignoreAbort) {
          logger.debug('Async operation was aborted');
          return undefined;
        }
        
        logger.error('Async operation failed:', error);
        
        if (isMountedRef.current && onError) {
          onError(error);
        }
      }
      throw error;
    }
  }, [onError, ignoreAbort]);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { run, abort };
}

/**
 * Safe setState helper that checks if component is still mounted
 */
export function useSafeState<T>() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const safeSetState = useCallback(<K extends T>(
    setter: Dispatch<SetStateAction<K>>,
    value: K
  ) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  return safeSetState;
}
