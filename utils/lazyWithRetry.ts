import React from 'react';
import { logger } from './logger';

const RELOAD_GUARD_KEY = 'db_chunk_reload_attempted';

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  return (
    name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Loading chunk \d+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message)
  );
}

export function reloadForStaleChunk(error: unknown): void {
  try {
    const alreadyTried = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (alreadyTried) {
      logger.error('Chunk reload already attempted this session, not looping:', error);
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — still attempt reload once
  }
  window.location.reload();
}

export function clearChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // ignore
  }
}

export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error)) {
        logger.warn('Stale chunk detected, reloading for fresh asset manifest:', error);
        reloadForStaleChunk(error);
        return await new Promise<{ default: T }>(() => {
          // Never resolves — reload takes over. Suspense keeps showing the fallback.
        });
      }
      throw error;
    }
  });
}
