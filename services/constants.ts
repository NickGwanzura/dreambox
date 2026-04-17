/**
 * Application Constants
 * Centralized configuration values to eliminate magic numbers
 */

// Animation & Timing
export const ANIMATION_DURATION = 800;
export const TOAST_DURATION = 4500;
export const MODAL_TRANSITION_DURATION = 300;

// Sync Intervals (milliseconds)
export const SYNC_INTERVAL_MS = 5000;
export const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const BILLING_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const ALERT_CHECK_INTERVAL_MS = 10000; // 10 seconds

// Data Sync Windows
export const NEW_ITEM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes for new items
export const RESTORE_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes after restore

// Timeouts
export const API_TIMEOUT_MS = 30000;
export const LOGIN_DELAY_MS = 800;
export const REGISTER_DELAY_MS = 1000;
export const PASSWORD_RESET_DELAY_MS = 1500;

// Pagination & Limits
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_UPLOAD_SIZE_MB = 5;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

// Financial
export const VAT_RATE = 0.15;
export const DEFAULT_CURRENCY = 'USD';

// Validation Limits
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MIN_PASSWORD_LENGTH = 6;
export const PHONE_REGEX = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Storage Keys (centralized to prevent typos)
export const STORAGE_KEYS = {
  BILLBOARDS: 'db_billboards',
  CONTRACTS: 'db_contracts',
  INVOICES: 'db_invoices',
  EXPENSES: 'db_expenses',
  USERS: 'db_users',
  CLIENTS: 'db_clients',
  LOGS: 'db_logs',
  OUTSOURCED: 'db_outsourced',
  PRINTING: 'db_printing',
  TASKS: 'db_tasks',
  MAINTENANCE: 'db_maintenance_logs',
  LOGO: 'db_logo',
  PROFILE: 'db_company_profile',
  LAST_BACKUP: 'db_last_backup_meta',
  AUTO_BACKUP: 'db_auto_backup_data',
  CLOUD_BACKUP: 'db_cloud_backup_meta',
  CLOUD_MIRROR: 'db_cloud_mirror_data',
  DATA_VERSION: 'db_data_version',
  RESTORE_TIMESTAMP: 'db_restore_timestamp',
  DELETED_QUEUE: 'db_deleted_queue',
  CURRENT_USER: 'billboard_user',
  AUTH_TOKEN: 'db_auth_token',
  
  // CRM System
  CRM_COMPANIES: 'db_crm_companies',
  CRM_CONTACTS: 'db_crm_contacts',
  CRM_OPPORTUNITIES: 'db_crm_opportunities',
  CRM_TOUCHPOINTS: 'db_crm_touchpoints',
  CRM_TASKS: 'db_crm_tasks',
  CRM_EMAIL_THREADS: 'db_crm_email_threads',
  CRM_CALL_LOGS: 'db_crm_call_logs',
  CRM_CSV_IMPORT_HISTORY: 'db_crm_csv_import_history',
} as const;

// Feature Flags
export const FEATURES = {
  ENABLE_REALTIME_SYNC: true,
  ENABLE_AI_FEATURES: true,
  ENABLE_ANALYTICS: true,
  ENABLE_OFFLINE_MODE: true,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  STORAGE_FULL: 'Storage is full. Please clear some data and try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_PENDING: 'Account awaiting administrator approval.',
  ACCOUNT_RESTRICTED: 'Account access has been restricted.',
  VALIDATION_FAILED: 'Please check your input and try again.',
} as const;

// Version
export const APP_VERSION = '1.9.25';
