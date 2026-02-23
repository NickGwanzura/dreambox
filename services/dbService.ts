import { supabase } from './supabaseClient';
import { User, Billboard, Client, Contract } from '../types';

const ensureClient = (): boolean => {
  if (!supabase) {
    console.warn('Supabase client not initialized. Check environment variables.');
    return false;
  }
  return true;
};

export const fetchFromTable = async <T = any>(table: string, select = '*'): Promise<T[] | null> => {
  if (!ensureClient()) return null;
  try {
    const { data, error } = await supabase.from(table).select(select as any);
    if (error) {
      console.error(`Supabase fetch error (${table}):`, error);
      return null;
    }
    return data as T[];
  } catch (e) {
    console.error(`Exception fetching ${table}:`, e);
    return null;
  }
};

export const fetchUsers = async (): Promise<User[] | null> => fetchFromTable<User>('users');
export const fetchBillboards = async (): Promise<Billboard[] | null> => fetchFromTable<Billboard>('billboards');
export const fetchClients = async (): Promise<Client[] | null> => fetchFromTable<Client>('clients');
export const fetchContracts = async (): Promise<Contract[] | null> => fetchFromTable<Contract>('contracts');

export default {
  fetchFromTable,
  fetchUsers,
  fetchBillboards,
  fetchClients,
  fetchContracts,
};
