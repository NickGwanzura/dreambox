export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export class PaginationError extends Error {}

/**
 * Parse the single offset-pagination contract used by ERP collection APIs.
 * `skip` remains accepted for older clients, but page/limit are canonical.
 */
export function parsePagePagination(query: Record<string, unknown>, max = 100): { take: number; skip: number; page: number; limit: number } {
  const rawPage = query.page;
  const rawLimit = query.limit;
  const rawSkip = query.skip;
  const asPositiveInt = (value: unknown, name: string): number | undefined => {
    if (value === undefined || value === '') return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) throw new PaginationError(`${name} must be a positive integer`);
    return number;
  };
  const asNonNegativeInt = (value: unknown, name: string): number | undefined => {
    if (value === undefined || value === '') return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new PaginationError(`${name} must be a non-negative integer`);
    return number;
  };

  const limit = asPositiveInt(rawLimit, 'limit') ?? Math.min(50, max);
  if (limit > max) throw new PaginationError(`limit must not exceed ${max}`);
  const page = asPositiveInt(rawPage, 'page');
  const skip = asNonNegativeInt(rawSkip, 'skip');
  if (page !== undefined && skip !== undefined) throw new PaginationError('Use either page or skip, not both');
  const resolvedSkip = skip ?? ((page ?? 1) - 1) * limit;
  return { take: limit, skip: resolvedSkip, page: page ?? Math.floor(resolvedSkip / limit) + 1, limit };
}

/** Legacy Prisma-spread adapter. New collection routes should use parsePagePagination. */
export function parsePagination(query: Record<string, unknown>, max = 500): { take: number; skip: number } {
  const { take, skip } = parsePagePagination(query, max);
  return { take, skip };
}

export function paginated<T>(data: T[], page: number, limit: number, total: number): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
