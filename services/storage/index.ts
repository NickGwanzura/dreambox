/**
 * Storage & Sync Module
 * Centralized exports for storage and application database API sync functionality
 */

// Core application database API helpers
export {
  // Connection
  checkDatabaseHealth,
  waitForDatabase,

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
} from './databaseHelpers';

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
  isConfigured as isDatabaseConfigured,
  checkConnection as checkDatabaseConnection,
  // Legacy aliases (deprecated)
  isConfigured as isSupabaseConfigured,
  checkConnection as checkSupabaseConnection,
} from '../apiClient';
