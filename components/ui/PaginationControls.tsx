import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '../../services/pagination';

export const PaginationControls: React.FC<{ pagination: PaginationMeta | null; onPageChange: (page: number) => void; disabled?: boolean }> = ({ pagination, onPageChange, disabled = false }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4" aria-live="polite">
    <p className="text-xs font-medium text-slate-800">Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()} records</p>
    <div className="flex gap-2">
      <button type="button" aria-label="Previous page" disabled={disabled || !pagination.hasPreviousPage} onClick={() => onPageChange(pagination.page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeft size={16} /> Previous</button>
      <button type="button" aria-label="Next page" disabled={disabled || !pagination.hasNextPage} onClick={() => onPageChange(pagination.page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Next <ChevronRight size={16} /></button>
    </div>
  </div>;
};
