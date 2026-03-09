/**
 * Generic Entity Store Factory
 * Creates consistent CRUD operations for any entity type
 */

import { loadFromStorage, saveToStorage } from '../storage/localStorage';
import { logger } from '../../utils/logger';

export interface Entity {
  id: string;
}

export interface EntityStore<T extends Entity> {
  getAll: () => T[];
  getById: (id: string) => T | undefined;
  add: (item: T) => void;
  update: (item: T) => void;
  delete: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface EntityStoreConfig<T extends Entity> {
  storageKey: string;
  tableName: string;
  initialData?: T[];
  validate?: (item: T) => void;
  onAdd?: (item: T) => void;
  onUpdate?: (item: T, oldItem: T) => void;
  onDelete?: (item: T) => void;
}

export function createEntityStore<T extends Entity>(
  config: EntityStoreConfig<T>
): EntityStore<T> {
  const { storageKey, initialData = [] } = config;
  
  // Initialize state
  let items: T[] = loadFromStorage<T[]>(storageKey, null) ?? initialData;
  const listeners = new Set<() => void>();

  // Save to storage helper
  const persist = () => {
    saveToStorage(storageKey, items);
  };

  // Notify listeners
  const notify = () => {
    listeners.forEach(listener => {
      try {
        listener();
      } catch (e) {
        logger.error('Error in store listener:', e);
      }
    });
  };

  return {
    getAll: () => [...items],
    
    getById: (id: string) => items.find(item => item.id === id),
    
    add: (item: T) => {
      if (config.validate) {
        config.validate(item);
      }
      
      items = [...items, item];
      persist();
      
      if (config.onAdd) {
        config.onAdd(item);
      }
      
      notify();
      logger.debug(`Added item to ${storageKey}:`, item.id);
    },
    
    update: (updatedItem: T) => {
      const index = items.findIndex(item => item.id === updatedItem.id);
      if (index === -1) {
        logger.warn(`Item not found for update in ${storageKey}:`, updatedItem.id);
        return;
      }
      
      if (config.validate) {
        config.validate(updatedItem);
      }
      
      const oldItem = items[index];
      items = items.map(item => item.id === updatedItem.id ? updatedItem : item);
      persist();
      
      if (config.onUpdate) {
        config.onUpdate(updatedItem, oldItem);
      }
      
      notify();
      logger.debug(`Updated item in ${storageKey}:`, updatedItem.id);
    },
    
    delete: (id: string) => {
      const item = items.find(i => i.id === id);
      if (!item) {
        logger.warn(`Item not found for deletion in ${storageKey}:`, id);
        return;
      }
      
      items = items.filter(i => i.id !== id);
      persist();
      
      if (config.onDelete) {
        config.onDelete(item);
      }
      
      notify();
      logger.debug(`Deleted item from ${storageKey}:`, id);
    },
    
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Create a computed store that derives data from other stores
 */
export function createComputedStore<T>(
  deps: Array<() => void>,
  compute: () => T
): { get: () => T; subscribe: (listener: (value: T) => void) => () => void } {
  let cachedValue: T = compute();
  const listeners = new Set<(value: T) => void>();
  
  const update = () => {
    const newValue = compute();
    if (JSON.stringify(newValue) !== JSON.stringify(cachedValue)) {
      cachedValue = newValue;
      listeners.forEach(listener => listener(newValue));
    }
  };
  
  // Subscribe to all dependencies
  const unsubscribers = deps.map(dep => {
    if (typeof dep === 'function' && 'subscribe' in (dep as any)) {
      return (dep as any).subscribe(update);
    }
    return () => {};
  });
  
  return {
    get: () => cachedValue,
    subscribe: (listener: (value: T) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribers.forEach(unsub => unsub());
        }
      };
    },
  };
}
