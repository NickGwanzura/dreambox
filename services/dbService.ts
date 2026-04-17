import { api } from './apiClient';
import { User, Billboard, Client, Contract } from '../types';

export const fetchFromTable = async <T = any>(table: string): Promise<T[] | null> => {
  try {
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
