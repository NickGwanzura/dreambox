/**
 * Supabase Realtime Sync Service
 * Replaces polling with real-time subscriptions
 */

import { supabase } from '../supabaseClient';
import { logger } from '../../utils/logger';

export type TableName = 
  | 'billboards' 
  | 'clients' 
  | 'contracts' 
  | 'invoices' 
  | 'expenses' 
  | 'users' 
  | 'tasks' 
  | 'maintenance_logs';

export interface RealtimeChange<T = any> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T | null;
  old: T | null;
  table: TableName;
}

type ChangeCallback<T> = (change: RealtimeChange<T>) => void;

class RealtimeSyncService {
  private channels: Map<string, any> = new Map();
  private isEnabled: boolean = true;

  /**
   * Subscribe to changes on a specific table
   */
  subscribe<T>(
    table: TableName,
    callback: ChangeCallback<T>,
    options: { filter?: string } = {}
  ): () => void {
    if (!supabase) {
      logger.warn('Supabase not initialized, realtime sync disabled');
      return () => {};
    }

    if (!this.isEnabled) {
      logger.debug('Realtime sync is disabled');
      return () => {};
    }

    const channelName = `${table}_changes`;
    
    // Remove existing subscription for this table
    this.unsubscribe(table);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: options.filter,
        },
        (payload: any) => {
          const change: RealtimeChange<T> = {
            eventType: payload.eventType,
            new: payload.new as T,
            old: payload.old as T,
            table: table,
          };
          
          logger.debug(`Realtime change on ${table}:`, change.eventType);
          callback(change);
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          logger.info(`Subscribed to ${table} changes`);
        } else if (status === 'CHANNEL_ERROR') {
          logger.error(`Failed to subscribe to ${table}`);
        }
      });

    this.channels.set(table, channel);

    // Return unsubscribe function
    return () => this.unsubscribe(table);
  }

  /**
   * Unsubscribe from a table
   */
  unsubscribe(table: TableName): void {
    const channel = this.channels.get(table);
    if (channel) {
      supabase?.removeChannel(channel);
      this.channels.delete(table);
      logger.debug(`Unsubscribed from ${table}`);
    }
  }

  /**
   * Unsubscribe from all tables
   */
  unsubscribeAll(): void {
    this.channels.forEach((channel, table) => {
      supabase?.removeChannel(channel);
      logger.debug(`Unsubscribed from ${table}`);
    });
    this.channels.clear();
  }

  /**
   * Enable/disable realtime sync
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.unsubscribeAll();
    }
  }

  /**
   * Check if subscribed to a table
   */
  isSubscribed(table: TableName): boolean {
    return this.channels.has(table);
  }

  /**
   * Get list of subscribed tables
   */
  getSubscribedTables(): TableName[] {
    return Array.from(this.channels.keys()) as TableName[];
  }
}

export const realtimeSync = new RealtimeSyncService();

/**
 * Hook-compatible wrapper for realtime sync
 */
export function createRealtimeSubscription<T>(
  table: TableName,
  onChange: (data: T) => void,
  options?: { filter?: string }
): () => void {
  return realtimeSync.subscribe<T>(
    table,
    (change) => {
      if (change.eventType !== 'DELETE' && change.new) {
        onChange(change.new);
      }
    },
    options
  );
}
