/**
 * User Management Service
 * Integrates with Supabase Auth for user CRUD operations
 */

import { supabase } from './supabaseClient';
import { User } from '../types';
import { logger } from '../utils/logger';

export type UserCreateData = {
  firstName: string;
  lastName: string;
  email: string;
  role: 'Admin' | 'Manager' | 'Staff';
  password?: string;
};

/**
 * Create a new user (Admin only)
 * Creates user in Supabase Auth AND our users table
 */
export const createUser = async (userData: UserCreateData): Promise<{ user: User | null; error: Error | null }> => {
  if (!supabase) {
    return { user: null, error: new Error('Supabase not configured') };
  }

  try {
    // Generate a temporary password if not provided
    const tempPassword = userData.password || generateTempPassword();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        first_name: userData.firstName,
        last_name: userData.lastName,
      },
    });

    if (authError) {
      // If admin API fails (needs service role), fall back to regular signup
      if (authError.message.includes('service_role')) {
        logger.warn('Admin API not available, using regular signup');
        
        // Create user via signup (will need email verification)
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: userData.email,
          password: tempPassword,
          options: {
            data: {
              first_name: userData.firstName,
              last_name: userData.lastName,
            },
          },
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error('Failed to create user');

        // Create user record in our database
        const newUser: User = {
          id: signUpData.user.id,
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          username: userData.email.split('@')[0],
          role: userData.role,
          status: 'Active', // Admin-created users are auto-approved
        };

        const { error: dbError } = await supabase.from('users').insert(newUser);
        if (dbError) throw dbError;

        return { user: newUser, error: null };
      }
      
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user in Auth');
    }

    // Create user record in our database
    const newUser: User = {
      id: authData.user.id,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      username: userData.email.split('@')[0],
      role: userData.role,
      status: 'Active', // Admin-created users are auto-approved
    };

    const { error: dbError } = await supabase.from('users').insert(newUser);
    if (dbError) {
      logger.error('Failed to create user in database:', dbError);
      // Don't fail - user exists in Auth, can fix DB later
    }

    logger.info(`User created by admin: ${userData.email}`);
    return { user: newUser, error: null };
  } catch (error: any) {
    logger.error('Create user error:', error);
    return { user: null, error: new Error(error.message || 'Failed to create user') };
  }
};

/**
 * Update a user
 * Updates both Supabase Auth and our users table
 */
export const updateUserData = async (userId: string, updates: Partial<User>): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    // Update our database
    const { error: dbError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    if (dbError) throw dbError;

    // If email changed, update in Auth too
    if (updates.email) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        userId,
        { email: updates.email }
      );

      if (authError && !authError.message.includes('service_role')) {
        logger.error('Failed to update auth email:', authError);
        // Don't fail - DB is updated, Auth can be fixed separately
      }
    }

    logger.info(`User updated: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Update user error:', error);
    return { error: new Error(error.message || 'Failed to update user') };
  }
};

/**
 * Delete a user
 * Deletes from both Supabase Auth and our users table
 */
export const deleteUserData = async (userId: string): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    // Delete from our database first
    const { error: dbError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (dbError) throw dbError;

    // Delete from Supabase Auth
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);

    if (authError && !authError.message.includes('service_role')) {
      logger.error('Failed to delete auth user:', authError);
      // Don't fail - user is removed from app, just not Auth
    }

    logger.info(`User deleted: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Delete user error:', error);
    return { error: new Error(error.message || 'Failed to delete user') };
  }
};

/**
 * Approve a pending user
 * Updates status to Active and assigns role
 */
export const approveUser = async (
  userId: string,
  role: 'Admin' | 'Manager' | 'Staff'
): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    const { error } = await supabase
      .from('users')
      .update({ status: 'Active', role })
      .eq('id', userId);

    if (error) throw error;

    logger.info(`User approved: ${userId} with role ${role}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Approve user error:', error);
    return { error: new Error(error.message || 'Failed to approve user') };
  }
};

/**
 * Reject a pending user
 * Sets status to Rejected or deletes the user
 */
export const rejectUser = async (userId: string, deleteInstead: boolean = false): Promise<{ error: Error | null }> => {
  if (!supabase) {
    return { error: new Error('Supabase not configured') };
  }

  try {
    if (deleteInstead) {
      return await deleteUserData(userId);
    } else {
      const { error } = await supabase
        .from('users')
        .update({ status: 'Rejected' })
        .eq('id', userId);

      if (error) throw error;
    }

    logger.info(`User rejected: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Reject user error:', error);
    return { error: new Error(error.message || 'Failed to reject user') };
  }
};

/**
 * Fetch all users from database
 */
export const fetchAllUsers = async (): Promise<{ users: User[]; error: Error | null }> => {
  if (!supabase) {
    return { users: [], error: new Error('Supabase not configured') };
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { users: data || [], error: null };
  } catch (error: any) {
    logger.error('Fetch users error:', error);
    return { users: [], error: new Error(error.message || 'Failed to fetch users') };
  }
};

/**
 * Reset user password (Admin action)
 * Generates new temp password
 */
export const resetUserPassword = async (userId: string): Promise<{ tempPassword: string | null; error: Error | null }> => {
  if (!supabase) {
    return { tempPassword: null, error: new Error('Supabase not configured') };
  }

  try {
    const tempPassword = generateTempPassword();

    const { error } = await supabase.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    );

    if (error) {
      if (error.message.includes('service_role')) {
        return { tempPassword: null, error: new Error('Admin API requires service role key') };
      }
      throw error;
    }

    logger.info(`Password reset for user: ${userId}`);
    return { tempPassword, error: null };
  } catch (error: any) {
    logger.error('Reset password error:', error);
    return { tempPassword: null, error: new Error(error.message || 'Failed to reset password') };
  }
};

// Helper function to generate temporary passwords
function generateTempPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Legacy compatibility exports
export const addUser = createUser;
export const updateUser = updateUserData;
export const deleteUser = deleteUserData;
