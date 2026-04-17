/**
 * Storage & Sync Module
 * Centralized exports for storage and Neon API sync functionality
 */

// Core Neon API helpers
export {
  // Connection
  checkNeonHealth,
  waitForNeon,

  // Legacy aliases (deprecated)
  checkSupabaseHealth,
  waitForSupabase,

  // Generic fetch
  fetchAll,
  fetchById,
  upsertRecord,
  deleteRecord,

  // Backup & stats
  exportAllData,
  getDatabaseStats,

  // Types
  type SyncOptions,
  type SyncResult,
  type RealtimeCallbacks,
} from './neonHelpers';

// Local storage helpers
export {
  loadFromStorage,
  saveToStorage,
  clearAllData,
  getStorageUsage,
  isStorageNearingLimit,
  StorageError,
} from './localStorage';

// Re-export API client
export {
  isConfigured as isNeonConfigured,
  checkConnection as checkNeonConnection,
  // Legacy aliases (deprecated)
  isConfigured as isSupabaseConfigured,
  checkConnection as checkSupabaseConnection,
} from '../apiClient';
