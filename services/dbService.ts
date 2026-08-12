import { api } from './apiClient';
import { fetchAllPages } from './pagination';
import { User, Billboard, Client, Contract } from '../types';

export const fetchFromTable = async <T = any>(table: string): Promise<T[] | null> => {
  try {
    // Core ERP collections are paginated; this helper remains a full-record
    // utility for non-list consumers such as relationship pickers.
    if (['clients', 'contracts', 'invoices', 'expenses'].includes(table)) {
      return await fetchAllPages<T>(`/api/${table}`);
    }
    return await api.get<T[]>(`/api/${table}`);
  } catch (e) {
    console.error(`Error fetching ${table}:`, e);
    return null;
  }
};

export const fetchUsers = (): Promise<User[] | null> => fetchFromTable<User>('users');
export const fetchBillboards = (): Promise<Billboard[] | null> => fetchFromTable<Billboard>('billboards');
export const fetchClients = (): Promise<Client[] | null> => fetchFromTable<Client>('clients');
export const fetchContracts = (): Promise<Contract[] | null> => fetchFromTable<Contract>('contracts');

export default { fetchFromTable, fetchUsers, fetchBillboards, fetchClients, fetchContracts };
