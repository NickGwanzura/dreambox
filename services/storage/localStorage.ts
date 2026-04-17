/**
 * Local Storage Service
 * Handles all localStorage operations with error handling and quota management
 */

import { STORAGE_KEYS } from '../constants';
import { logger } from '../../utils/logger';

export class StorageError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Load data from localStorage with type safety
 */
export function loadFromStorage<T>(key: string, defaultValue: T | null): T | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return JSON.parse(stored) as T;
  } catch (e) {
    logger.error(`Error loading ${key}:`, e);
    return defaultValue;
  }
}

/**
 * Save data to localStorage with quota handling
 */
export function saveToStorage(key: string, data: unknown): void {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
  } catch (e: any) {
    logger.error(`Error saving ${key}:`, e);
    
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      logger.warn('Storage full! Attempting auto-cleanup...');
      handleStorageFull();
      
      // Retry once after cleanup
      try {
        const serialized = JSON.stringify(data);
        localStorage.setItem(key, serialized);
        logger.info(`Successfully saved ${key} after cleanup`);
      } catch (retryError) {
        throw new StorageError(
          'Unable to save data. Storage is full. Please clear some data.',
          'QUOTA_EXCEEDED'
        );
      }
    } else {
      throw new StorageError(`Failed to save ${key}: ${e.message}`);
    }
  }
}

/**
 * Attempt to free up storage space
 */
export function handleStorageFull(): void {
  // Remove non-essential data
  const removableKeys = [
    STORAGE_KEYS.LOGS,
    STORAGE_KEYS.AUTO_BACKUP,
    STORAGE_KEYS.CLOUD_MIRROR,
  ];
  
  for (const key of removableKeys) {
    try {
      localStorage.removeItem(key);
      logger.info(`Removed ${key} to free up space`);
    } catch (e) {
      logger.warn(`Could not remove ${key}:`, e);
    }
  }
}

/**
 * Clear all app-related data
 */
export function clearAllData(): void {
  // Preserve auth token across clear
  const authToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

  localStorage.clear();

  if (authToken) localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, authToken);
  
  logger.info('All local data cleared');
}

/**
 * Calculate storage usage
 */
export function getStorageUsage(): { usedKB: number; percentage: number } {
  let total = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key) && key.startsWith('db_')) {
      total += localStorage[key].length * 2; // UTF-16 encoding
    }
  }
  
  // Estimate: typical localStorage limit is 5-10MB
  const estimatedLimit = 5 * 1024 * 1024;
  const usedKB = total / 1024;
  const percentage = (total / estimatedLimit) * 100;
  
  return { usedKB, percentage };
}

/**
 * Check if storage is nearing capacity
 */
export function isStorageNearingLimit(threshold = 80): boolean {
  const { percentage } = getStorageUsage();
  return percentage > threshold;
}

/**
 * Subscribe to storage changes (cross-tab communication)
 */
export function subscribeToStorage(
  keys: string[],
  callback: (key: string, newValue: unknown) => void
): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key && keys.includes(event.key)) {
      try {
        const value = event.newValue ? JSON.parse(event.newValue) : null;
        callback(event.key, value);
      } catch (e) {
        logger.error('Error parsing storage change:', e);
      }
    }
  };
  
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
