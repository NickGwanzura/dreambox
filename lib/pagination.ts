export function parsePagination(query: Record<string, unknown>, max = 500): { take: number; skip: number } {
  const requestedLimit = Number(query.limit);
  const requestedSkip = Number(query.skip);
  return {
    take: Number.isFinite(requestedLimit) ? Math.min(max, Math.max(1, Math.floor(requestedLimit))) : Math.min(100, max),
    skip: Number.isFinite(requestedSkip) ? Math.max(0, Math.floor(requestedSkip)) : 0,
  };
}
