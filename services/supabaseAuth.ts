/**
 * Supabase Authentication Service
 * Handles email/password auth with verification and password reset
 */

import { supabase } from './supabaseClient';
import { User } from '../types';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from './constants';

// Session user type (without password)
export type SessionUser = Omit<User, 'password'>;

/**
 * Sign up with email and password
 * Sends verification email automatically
 */
export const signUp = async (
  firstName: string,
  lastName: string,
  email: string,
  password: string
): Promise<{ user: SessionUser | null; error: Error | null }> => {
  if (!supabase) {
    return { user: null, error: new Error('Supabase not configured') };
  }

  try {
    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      logger.error('Supabase signup error:', authError);
      return { user: null, error: new Error(authError.message) };
    }

    if (!authData.user) {
      return { user: null, error: new Error('Failed to create user') };
    }

    // Create user profile in our users table
    const newUser: User = {
      id: authData.user.id,
      firstName,
      lastName,
      email: authData.user.email!,
      username: email.split('@')[0],
      role: 'Staff',
      status: 'Pending', // Requires admin approval even after email verification
    };

    // Save to our users table
    const { error: dbError } = await supabase.from('users').upsert(newUser);
    if (dbError) {
      logger.error('Failed to save user to database:', dbError);
    }

    const sessionUser = createSessionUser(newUser);
    logger.info(`New user registered: ${email}`);

    return { user: sessionUser, error: null };
  } catch (error: any) {
    logger.error('Signup exception:', error);
    return { user: null, error: new Error(error.message || 'Registration failed') };
  }
};

/**
 * Sign in with email and password
 */
export const signIn = async (
  email: string,
  password: string
): Promise<{ user: SessionUser | null; error: Error | null }> => {
  if (!supabase) {
    return { user: null, error: new Error('Supabase not configured') };
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      logger.warn(`Failed login attempt for ${email}:`, authError.message);
      return { user: null, error: new Error('Invalid email or password') };
    }

    if (!authData.user) {
      return { user: null, error: new Error('Login failed') };
    }

    // Check if email is verified
    if (!authData.user.email_confirmed_at) {
      return { user: null, error: new Error('Please verify your email before logging in') };
    }

    // Fetch user profile from our database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      logger.error('Failed to fetch user profile:', userError);
      return { user: null, error: new Error('Failed to load user profile') };
    }

    // Check account status
    if (userData.status === 'Pending') {
      return { user: null, error: new Error('Account awaiting administrator approval') };
    }
    if (userData.status === 'Rejected') {
      return { user: null, error: new Error('Account access has been restricted') };
    }

    const sessionUser = createSessionUser(userData);
    saveSession(sessionUser);
    logger.info(`User logged in: ${email}`);

    return { user: sessionUser, error: null };
  } catch (error: any) {
    logger.error('Login exception:', error);
    return { user: null, error: new Error(error.message || 'Login failed') };
  }
};

/**
 * Send password reset email
 */
export const sendPasswordReset = async (email: string): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      logger.error('Password reset error:', error);
      return { error: new Error(error.message) };
    }

    logger.info(`Password reset email sent to: ${email}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Password reset exception:', error);
    return { error: new Error(error.message || 'Failed to send reset email') };
  }
};

/**
 * Update password with reset token
 */
export const updatePassword = async (newPassword: string): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      logger.error('Update password error:', error);
      return { error: new Error(error.message) };
    }

    logger.info('Password updated successfully');
    return { error: null };
  } catch (error: any) {
    logger.error('Update password exception:', error);
    return { error: new Error(error.message || 'Failed to update password') };
  }
};

/**
 * Resend verification email
 */
export const resendVerificationEmail = async (email: string): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      logger.error('Resend verification error:', error);
      return { error: new Error(error.message) };
    }

    logger.info(`Verification email resent to: ${email}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Resend verification exception:', error);
    return { error: new Error(error.message || 'Failed to resend verification email') };
  }
};

/**
 * Sign out
 */
export const signOut = async (): Promise<void> => {
  if (!supabase) {
    clearSession();
    return;
  }

  try {
    await supabase.auth.signOut();
    clearSession();
    logger.info('User signed out');
  } catch (error) {
    logger.error('Signout error:', error);
    clearSession();
  }
};

/**
 * Get current session
 */
export const getSession = async (): Promise<{ user: SessionUser | null; error: Error | null }> => {
  if (!supabase) {
    // Fallback to localStorage
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (stored) {
      try {
        return { user: JSON.parse(stored), error: null };
      } catch {
        return { user: null, error: null };
      }
    }
    return { user: null, error: null };
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return { user: null, error: error ? new Error(error.message) : null };
    }

    // Fetch user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData) {
      return { user: null, error: new Error('Failed to load user profile') };
    }

    const sessionUser = createSessionUser(userData);
    saveSession(sessionUser);

    return { user: sessionUser, error: null };
  } catch (error: any) {
    logger.error('Get session exception:', error);
    return { user: null, error: new Error(error.message) };
  }
};

/**
 * Listen to auth state changes
 */
export const onAuthStateChange = (callback: (user: SessionUser | null) => void) => {
  if (!supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (userData) {
        const sessionUser = createSessionUser(userData);
        saveSession(sessionUser);
        callback(sessionUser);
      }
    } else if (event === 'SIGNED_OUT') {
      clearSession();
      callback(null);
    } else if (event === 'USER_UPDATED' && session) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (userData) {
        const sessionUser = createSessionUser(userData);
        saveSession(sessionUser);
        callback(sessionUser);
      }
    }
  });
};

// Helper functions
function createSessionUser(user: User): SessionUser {
  const { password, ...sessionUser } = user as any;
  return sessionUser;
}

function saveSession(user: SessionUser): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } catch (e) {
    logger.error('Failed to save session:', e);
  }
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

// Legacy compatibility exports
export const login = signIn;
export const register = signUp;
export const logout = signOut;
export const getCurrentUser = async (): Promise<SessionUser | null> => {
  const { user } = await getSession();
  return user;
};
export const resetPassword = sendPasswordReset;
export const devLogin = async (): Promise<SessionUser | null> => {
  logger.warn('Dev login not supported with Supabase Auth');
  return null;
};
