/**
 * Auth Service — JWT auth via /api/auth/* endpoints (Neon PostgreSQL)
 * Uses custom JWT auth via /api/auth/* endpoints.
 */

import { api, setToken, clearToken, getToken } from './apiClient';
import { User } from '../types';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from './constants';

export type SessionUser = Omit<User, 'password'>;

// ============================================================
// SIGN UP
// ============================================================

export const signUp = async (
  firstName: string,
  lastName: string,
  email: string,
  password: string
): Promise<{ user: SessionUser | null; error: Error | null }> => {
  try {
    const { user } = await api.post<{ user: SessionUser }>('/api/auth/signup', {
      firstName, lastName, email, password,
    });
    logger.info(`New user registered: ${email}`);
    return { user, error: null };
  } catch (error: any) {
    logger.error('Signup error:', error);
    return { user: null, error: new Error(error.message || 'Registration failed') };
  }
};

// ============================================================
// SIGN IN
// ============================================================

export const signIn = async (
  email: string,
  password: string
): Promise<{ user: SessionUser | null; error: Error | null }> => {
  try {
    const { token, user } = await api.post<{ token: string; user: SessionUser }>('/api/auth/signin', {
      email, password,
    });
    setToken(token);
    saveSession(user);
    logger.info(`User logged in: ${email}`);
    return { user, error: null };
  } catch (error: any) {
    logger.warn(`Failed login for ${email}:`, error.message);
    return { user: null, error: new Error(error.message || 'Invalid email or password') };
  }
};

// ============================================================
// SIGN OUT
// ============================================================

export const signOut = async (): Promise<void> => {
  clearToken();
  clearSession();
  logger.info('User signed out');
};

// ============================================================
// GET SESSION (from localStorage, verified against server)
// ============================================================

export const getSession = async (): Promise<{ user: SessionUser | null; error: Error | null }> => {
  const token = getToken();
  if (!token) {
    return { user: null, error: null };
  }

  try {
    const { user } = await api.get<{ user: SessionUser }>('/api/auth/me');
    saveSession(user);
    return { user, error: null };
  } catch (error: any) {
    // Token invalid/expired — clear it
    clearToken();
    clearSession();
    return { user: null, error: null };
  }
};

// ============================================================
// PASSWORD RESET
// ============================================================

export const sendPasswordReset = async (email: string): Promise<{ error: Error | null }> => {
  try {
    await api.post('/api/auth/reset-password', { email });
    logger.info(`Password reset requested for: ${email}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Password reset error:', error);
    return { error: new Error(error.message || 'Failed to send reset email') };
  }
};

export const updatePassword = async (
  newPassword: string,
  resetToken?: string,
  currentPassword?: string
): Promise<{ error: Error | null }> => {
  try {
    if (resetToken) {
      await api.post('/api/auth/update-password', { token: resetToken, newPassword });
    } else {
      const result = await api.post<{ token?: string }>('/api/auth/update-password', { newPassword, currentPassword });
      // Store new token if returned (keeps session valid after password change)
      if (result.token) {
        setToken(result.token);
      }
    }
    logger.info('Password updated successfully');
    return { error: null };
  } catch (error: any) {
    logger.error('Update password error:', error);
    return { error: new Error(error.message || 'Failed to update password') };
  }
};

// ============================================================
// AUTH STATE LISTENER (polling-based replacement for onAuthStateChange)
// ============================================================

export const onAuthStateChange = (callback: (user: SessionUser | null) => void) => {
  let cancelled = false;

  const check = async () => {
    if (cancelled) return;
    const { user } = await getSession();
    callback(user);
  };

  check();

  // Re-verify session every 5 minutes
  const intervalId = setInterval(check, 5 * 60 * 1000);

  return {
    data: {
      subscription: {
        unsubscribe: () => {
          cancelled = true;
          clearInterval(intervalId);
        },
      },
    },
  };
};

// ============================================================
// HELPERS
// ============================================================

function saveSession(user: SessionUser): void {
  try { localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user)); } catch {}
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

// ============================================================
// LEGACY COMPATIBILITY EXPORTS
// ============================================================

export const login = signIn;
export const register = signUp;
export const logout = signOut;
export const resetPassword = sendPasswordReset;
export const getCurrentUser = async (): Promise<SessionUser | null> => {
  const { user } = await getSession();
  return user;
};
export const resendVerificationEmail = async (email: string): Promise<{ error: Error | null }> => {
  try {
    await api.post('/api/auth/resend-verification', { email });
    logger.info(`Resend verification requested for: ${email}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Resend verification error:', error);
    return { error: new Error(error.message || 'Failed to resend') };
  }
};
export const devLogin = async (): Promise<SessionUser | null> => {
  logger.warn('Dev login not supported');
  return null;
};
