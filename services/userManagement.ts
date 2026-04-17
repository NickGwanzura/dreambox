/**
 * User Management Service — all operations go through /api/users
 */

import { api } from './apiClient';
import { User, UserPermissions, LoginHistoryEntry } from '../types';
import { logger } from '../utils/logger';

export type UserCreateData = {
  firstName: string;
  lastName: string;
  email: string;
  role: 'Admin' | 'Manager' | 'Staff' | 'Sales Agent';
  password?: string;
};

export type BulkInviteEntry = {
  firstName: string;
  lastName: string;
  email: string;
  role: 'Admin' | 'Manager' | 'Staff' | 'Sales Agent';
};

export type BulkInviteResult = {
  email: string;
  status: 'created' | 'exists' | 'error';
  tempPassword?: string;
};

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

export const createUser = async (userData: UserCreateData): Promise<{ user: User | null; error: Error | null }> => {
  try {
    const { user } = await api.post<{ user: User; tempPassword?: string }>('/api/users', userData);
    logger.info(`User created: ${userData.email}`);
    return { user, error: null };
  } catch (error: any) {
    logger.error('Create user error:', error);
    return { user: null, error: new Error(error.message || 'Failed to create user') };
  }
};

export const updateUserData = async (userId: string, updates: Partial<User> & { unlockAccount?: boolean; permissions?: UserPermissions }): Promise<{ error: Error | null }> => {
  try {
    await api.put(`/api/users`, updates, { id: userId });
    logger.info(`User updated: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Update user error:', error);
    return { error: new Error(error.message || 'Failed to update user') };
  }
};

export const deleteUserData = async (userId: string): Promise<{ error: Error | null }> => {
  try {
    await api.delete('/api/users', { id: userId });
    logger.info(`User deleted: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Delete user error:', error);
    return { error: new Error(error.message || 'Failed to delete user') };
  }
};

export const fetchAllUsers = async (): Promise<{ users: User[]; error: Error | null }> => {
  try {
    const users = await api.get<User[]>('/api/users');
    return { users, error: null };
  } catch (error: any) {
    logger.error('Fetch users error:', error);
    return { users: [], error: new Error(error.message || 'Failed to fetch users') };
  }
};

// ----------------------------------------------------------------
// APPROVAL / REJECTION / STATUS
// ----------------------------------------------------------------

export const approveUser = async (
  userId: string,
  role: 'Admin' | 'Manager' | 'Staff' | 'Sales Agent'
): Promise<{ error: Error | null }> => {
  try {
    await api.put('/api/users', { status: 'Active', role }, { id: userId });
    logger.info(`User approved: ${userId} with role ${role}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Approve user error:', error);
    return { error: new Error(error.message || 'Failed to approve user') };
  }
};

export const rejectUser = async (userId: string, deleteInstead = false): Promise<{ error: Error | null }> => {
  try {
    if (deleteInstead) return deleteUserData(userId);
    await api.put('/api/users', { status: 'Rejected' }, { id: userId });
    logger.info(`User rejected: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Reject user error:', error);
    return { error: new Error(error.message || 'Failed to reject user') };
  }
};

/** Soft-deactivate: sets status to Inactive (preserves data, blocks login) */
export const suspendUser = async (userId: string): Promise<{ error: Error | null }> => {
  try {
    await api.put('/api/users', { status: 'Inactive' }, { id: userId });
    logger.info(`User suspended: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Suspend user error:', error);
    return { error: new Error(error.message || 'Failed to suspend user') };
  }
};

/** Re-activate a suspended user */
export const reactivateUser = async (userId: string): Promise<{ error: Error | null }> => {
  try {
    await api.put('/api/users', { status: 'Active' }, { id: userId });
    logger.info(`User reactivated: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Reactivate user error:', error);
    return { error: new Error(error.message || 'Failed to reactivate user') };
  }
};

/** Unlock a locked account (too many failed login attempts) */
export const unlockUser = async (userId: string): Promise<{ error: Error | null }> => {
  try {
    await api.put('/api/users', { unlockAccount: true }, { id: userId });
    logger.info(`User unlocked: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Unlock user error:', error);
    return { error: new Error(error.message || 'Failed to unlock user') };
  }
};

// ----------------------------------------------------------------
// PERMISSIONS
// ----------------------------------------------------------------

export const updateUserPermissions = async (
  userId: string,
  permissions: UserPermissions
): Promise<{ error: Error | null }> => {
  try {
    await api.put('/api/users', { permissions }, { id: userId });
    logger.info(`Permissions updated: ${userId}`);
    return { error: null };
  } catch (error: any) {
    logger.error('Update permissions error:', error);
    return { error: new Error(error.message || 'Failed to update permissions') };
  }
};

// ----------------------------------------------------------------
// BULK INVITE
// ----------------------------------------------------------------

export const bulkInviteUsers = async (
  invites: BulkInviteEntry[]
): Promise<{ results: BulkInviteResult[]; error: Error | null }> => {
  try {
    const { results } = await api.post<{ results: BulkInviteResult[] }>('/api/users?action=bulkInvite', { invites });
    logger.info(`Bulk invite: ${results.length} processed`);
    return { results, error: null };
  } catch (error: any) {
    logger.error('Bulk invite error:', error);
    return { results: [], error: new Error(error.message || 'Failed to bulk invite') };
  }
};

// ----------------------------------------------------------------
// LOGIN HISTORY
// ----------------------------------------------------------------

export const fetchLoginHistory = async (
  userId: string
): Promise<{ history: LoginHistoryEntry[]; error: Error | null }> => {
  try {
    const history = await api.get<LoginHistoryEntry[]>(`/api/users?loginHistory=${userId}`);
    return { history, error: null };
  } catch (error: any) {
    logger.error('Fetch login history error:', error);
    return { history: [], error: new Error(error.message || 'Failed to fetch login history') };
  }
};

// ----------------------------------------------------------------
// PASSWORD RESET (admin-triggered)
// ----------------------------------------------------------------

export const adminResetPassword = async (userId: string): Promise<{ message: string | null; error: Error | null }> => {
  try {
    const { message } = await api.post<{ message: string }>('/api/users?action=adminReset', { userId });
    logger.info(`Admin password reset sent for user: ${userId}`);
    return { message, error: null };
  } catch (error: any) {
    logger.error('Admin reset password error:', error);
    return { message: null, error: new Error(error.message || 'Failed to send reset email') };
  }
};

// ----------------------------------------------------------------
// LEGACY EXPORTS
// ----------------------------------------------------------------
export const addUser = createUser;
export const updateUser = updateUserData;
export const deleteUser = deleteUserData;
export const resetUserPassword = adminResetPassword;
