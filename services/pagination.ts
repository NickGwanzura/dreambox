import { api } from './apiClient';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export const DEFAULT_PAGE_SIZE = 50;

export async function fetchPage<T>(path: string, page = 1, limit = DEFAULT_PAGE_SIZE, params: Record<string, string> = {}): Promise<PaginatedResult<T>> {
  return api.get<PaginatedResult<T>>(path, { ...params, page: String(page), limit: String(limit) });
}

/** Use only for relationship pickers and offline reconciliation, never a list view. */
export async function fetchAllPages<T>(path: string, params: Record<string, string> = {}, limit = 100): Promise<T[]> {
  const records: T[] = [];
  let page = 1;
  do {
    const result = await fetchPage<T>(path, page, limit, params);
    records.push(...result.data);
    if (!result.pagination.hasNextPage) return records;
    page += 1;
  } while (true);
}
