import { describe, expect, it } from 'vitest';
import { PaginationError, paginated, parsePagePagination, parsePagination } from '../lib/pagination';

describe('ERP collection pagination contract', () => {
  it('uses page and limit to calculate a stable offset', () => {
    expect(parsePagePagination({ page: '3', limit: '25' })).toEqual({ page: 3, limit: 25, take: 25, skip: 50 });
  });

  it('rejects invalid or conflicting page inputs', () => {
    expect(() => parsePagePagination({ page: '0' })).toThrow(PaginationError);
    expect(() => parsePagePagination({ limit: '101' })).toThrow(PaginationError);
    expect(() => parsePagePagination({ page: '1', skip: '0' })).toThrow(PaginationError);
  });

  it('keeps the legacy Prisma spread adapter limited to take and skip', () => {
    expect(parsePagination({ page: '2', limit: '20' })).toEqual({ take: 20, skip: 20 });
  });

  it('returns consistent metadata for the final page', () => {
    expect(paginated(['a', 'b'], 3, 25, 52)).toEqual({
      data: ['a', 'b'],
      pagination: { page: 3, limit: 25, total: 52, totalPages: 3, hasNextPage: false, hasPreviousPage: true },
    });
  });
});
