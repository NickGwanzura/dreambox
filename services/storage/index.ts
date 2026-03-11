/**
 * Supabase Storage & Sync Module
 * Centralized exports for all Supabase-related functionality
 */

// Core helpers
export {
  // Connection
  checkSupabaseHealth,
  waitForSupabase,
  
  // Generic fetch
  fetchAll,
  fetchById,
  fetchByField,
  searchRecords,
  
  // Entity-specific fetch
  fetchUsersFromSupabase,
  fetchBillboardsFromSupabase,
  fetchClientsFromSupabase,
  fetchContractsFromSupabase,
  fetchInvoicesFromSupabase,
  fetchTasksFromSupabase,
  fetchMaintenanceLogsFromSupabase,
  fetchExpensesFromSupabase,
  
  // Realtime
  subscribeToTable,
  unsubscribeAll,
  
  // Bulk operations
  bulkInsert,
  bulkUpdate,
  bulkDelete,
  
  // Sync & backup
  exportAllData,
  importAllData,
  getDatabaseStats,
  
  // React hooks
  useSupabaseQuery,
  useSupabaseRealtime,
  
  // Types
  type SyncOptions,
  type SyncResult,
  type RealtimeCallbacks,
} from './supabaseHelpers';

// Local storage helpers
export {
  loadFromStorage,
  saveToStorage,
  clearAllData,
  getStorageUsage,
  isStorageNearingLimit,
  StorageError,
} from './localStorage';

// Re-export supabase client
export { supabase, isSupabaseConfigured, checkSupabaseConnection } from '../supabaseClient';
