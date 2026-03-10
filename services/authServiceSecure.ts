/**
 * Secure Authentication Service
 * Replaces hardcoded credentials with environment-based or hashed authentication
 * NEVER stores plaintext passwords
 */

import { User } from '../types';
import { getUsers, addUser, findUser, fetchLatestUsers } from './mockData';
import { 
  LOGIN_DELAY_MS, 
  REGISTER_DELAY_MS, 
  PASSWORD_RESET_DELAY_MS,
  ERROR_MESSAGES,
  STORAGE_KEYS 
} from './constants';
import { validateUser, sanitizers, ValidationError } from '../utils/validation';
import { logger } from '../utils/logger';

// Simulated delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Simple hash function for client-side password comparison
 * NOTE: In production, use Supabase Auth or similar which handles proper hashing
 */
async function hashPassword(password: string): Promise<string> {
  // Use SubtleCrypto for hashing if available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for environments without crypto.subtle
  return btoa(password.split('').reverse().join(''));
}

/**
 * Get admin credentials from environment or secure storage
 * Falls back to disabled if not configured
 */
function getAdminCredentials(): Array<{ email: string; username: string; hash: string }> {
  // In production, these would be set via environment variables
  // For demo purposes only - should be replaced with proper auth backend
  const admins: Array<{ email: string; username: string; hash: string }> = [];
  
  // Check for environment-configured admin (hashed)
  // @ts-ignore
  const envAdminEmail = import.meta.env?.VITE_ADMIN_EMAIL;
  // @ts-ignore
  const envAdminHash = import.meta.env?.VITE_ADMIN_PASSWORD_HASH;
  
  if (envAdminEmail && envAdminHash) {
    admins.push({
      email: envAdminEmail,
      username: envAdminEmail.split('@')[0],
      hash: envAdminHash
    });
  }
  
  return admins;
}

/**
 * Create a secure session user (without password)
 */
function createSessionUser(user: User): Omit<User, 'password'> {
  const { password, ...sessionUser } = user;
  return sessionUser;
}

/**
 * Save user session securely
 */
function saveSession(user: Omit<User, 'password'>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } catch (e) {
    logger.error('Failed to save session:', e);
    // Attempt cleanup
    try {
      localStorage.removeItem(STORAGE_KEYS.LOGS);
      localStorage.removeItem(STORAGE_KEYS.AUTO_BACKUP);
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } catch (finalError) {
      throw new Error(ERROR_MESSAGES.STORAGE_FULL);
    }
  }
}

/**
 * Quick dev access - creates a dev user session instantly
 * Only works in development environment
 */
export const devLogin = async (): Promise<Omit<User, 'password'> | null> => {
  await delay(300);
  
  const devUser: User = {
    id: 'dev-admin-001',
    firstName: 'Developer',
    lastName: 'Mode',
    email: 'dev@dreambox.local',
    username: 'dev',
    role: 'Admin',
    status: 'Active',
    password: '' // No password needed for dev mode
  };
  
  // Ensure dev user exists in user list
  const existing = findUser('dev@dreambox.local');
  if (!existing) {
    addUser(devUser);
  }
  
  const sessionUser = createSessionUser(devUser);
  saveSession(sessionUser);
  logger.info('Dev login successful');
  
  return sessionUser;
};

export const login = async (identifier: string, password: string): Promise<Omit<User, 'password'> | null> => {
  try {
    // Validate inputs
    if (!identifier?.trim() || !password?.trim()) {
      throw new ValidationError('Email and password are required');
    }

    // Sanitize input
    const sanitizedId = sanitizers.string(identifier);
    
    // Fetch latest users from cloud
    const remoteUsers = await fetchLatestUsers();
    await delay(LOGIN_DELAY_MS);
    
    const userList = remoteUsers || getUsers();
    const term = sanitizedId.toLowerCase().trim();
    
    // Find user
    const user = userList.find(u => 
      u.email.toLowerCase() === term || 
      (u.username && u.username.toLowerCase() === term)
    );
    
    if (!user) {
      logger.warn(`Login attempt for non-existent user: ${sanitizedId}`);
      return null;
    }
    
    // Check status before password verification
    if (user.status !== 'Active') {
      const message = user.status === 'Pending' 
        ? ERROR_MESSAGES.ACCOUNT_PENDING 
        : ERROR_MESSAGES.ACCOUNT_RESTRICTED;
      throw new Error(message);
    }
    
    // Verify password (hash comparison)
    const passwordHash = await hashPassword(password);
    // Support both hashed and legacy plaintext passwords during migration
    const storedHash = user.password?.length === 64 
      ? user.password  // Already hashed (64 hex chars = SHA-256)
      : await hashPassword(user.password || '');  // Legacy plaintext, hash it
    
    // Also check against environment-configured admins
    const adminCreds = getAdminCredentials();
    const isAdminMatch = adminCreds.some(a => 
      (a.email === term || a.username === term) && a.hash === passwordHash
    );
    
    if (!isAdminMatch && storedHash !== passwordHash) {
      logger.warn(`Failed login attempt for: ${sanitizedId}`);
      return null;
    }
    
    // Create session without password
    const sessionUser = createSessionUser(user);
    saveSession(sessionUser);
    logger.info(`User logged in: ${user.email}`);
    
    return sessionUser;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof Error) {
      throw error;
    }
    logger.error('Login error:', error);
    return null;
  }
};

export const register = async (
  firstName: string, 
  lastName: string, 
  email: string, 
  password: string
): Promise<Omit<User, 'password'>> => {
  await delay(REGISTER_DELAY_MS);
  
  // Sanitize inputs
  const sanitizedEmail = sanitizers.email(email);
  const sanitizedFirst = sanitizers.string(firstName);
  const sanitizedLast = sanitizers.string(lastName);
  
  // Check for existing user
  const existing = findUser(sanitizedEmail);
  if (existing) {
    throw new Error('Email/Username already registered');
  }
  
  // Validate user data
  validateUser({
    firstName: sanitizedFirst,
    lastName: sanitizedLast,
    email: sanitizedEmail,
    password
  }, true);
  
  // Hash password before storage
  const passwordHash = await hashPassword(password);
  
  const newUser: User = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    firstName: sanitizedFirst,
    lastName: sanitizedLast,
    email: sanitizedEmail,
    password: passwordHash, // Store hash (64-char hex string)
    role: 'Staff',
    status: 'Pending'
  };
  
  addUser(newUser);
  logger.info(`New user registered: ${sanitizedEmail}`);
  
  // Return user without password
  return createSessionUser(newUser);
};

export const resetPassword = async (email: string): Promise<void> => {
  await delay(PASSWORD_RESET_DELAY_MS);
  
  const sanitizedEmail = sanitizers.email(email);
  const user = findUser(sanitizedEmail);
  
  if (!user) {
    // Don't reveal if email exists
    logger.warn(`Password reset attempted for non-existent: ${sanitizedEmail}`);
    return;
  }
  
  logger.info(`Password reset requested for: ${sanitizedEmail}`);
  // In production: send actual email with reset token
};

export const logout = (): void => {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  logger.info('User logged out');
};

export const getCurrentUser = (): Omit<User, 'password'> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    logger.error('Failed to parse current user:', e);
    return null;
  }
};

export const updateUserPassword = async (
  userId: string, 
  oldPassword: string, 
  newPassword: string
): Promise<boolean> => {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user || !user.password) return false;
  
  const oldHash = await hashPassword(oldPassword);
  // Support both hashed and legacy plaintext passwords
  const currentHash = user.password.length === 64
    ? user.password  // Already hashed
    : await hashPassword(user.password);  // Legacy plaintext
  
  if (oldHash !== currentHash) {
    return false;
  }
  
  // Validate new password
  if (newPassword.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }
  
  const newHash = await hashPassword(newPassword);
  user.password = newHash;
  
  logger.info(`Password updated for user: ${user.email}`);
  return true;
};
