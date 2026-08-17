import React, { useMemo, useState } from 'react';
import { X, Link2, Loader2, CheckCircle2, AlertTriangle, CalendarDays, Search } from 'lucide-react';
import { Invoice } from '../types';
import { api } from '../services/apiClient';

interface Props {
  receipt: Invoice | null;
  invoices: Invoice[]; // all documents from getInvoices()
  onClose: () => void;
  onLinked: () => void;
}

const AMOUNT_DELTA = 0.01;
const DATE_TOLERANCE_DAYS = 7;

function daysBetween(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((ta - tb) / 86_400_000);
}

/** Candidate invoice + why it matches, for human confirmation. */
interface Candidate {
  invoice: Invoice;
  dateDelta: number | null;
  remaining: number;
}

/**
 * Modal that links an unlinked payment (receipt) to the invoice it pays.
 * Proposes candidate invoices matched by client + amount (+ date proximity)
 * and lets the user confirm before calling POST /api/payment-links.
 */
export const LinkPaymentModal: React.FC<Props> = ({ receipt, invoices, onClose, onLinked }) => {
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const candidates: Candidate[] = useMemo(() => {
    if (!receipt) return [];
    const receipts = invoices.filter(i => String(i.type || '').toLowerCase() === 'receipt');
    const paidBy = new Map<string, number>();
    for (const r of receipts) {
      if (!r.isVoided && r.linkedInvoiceId) {
        paidBy.set(r.linkedInvoiceId, (paidBy.get(r.linkedInvoiceId) ?? 0) + Number(r.total || 0));
      }
    }
    const amount = Number(receipt.total || 0);
    const list = invoices
      .filter(inv => {
        const t = String(inv.type || '').toLowerCase();
        if (t !== 'invoice' && t !== 'proforma') return false;
        if (inv.isVoided) return false;
        if (receipt.clientId && inv.clientId && receipt.clientId !== inv.clientId) return false;
        if (Math.abs(Number(inv.total || 0) - amount) >= AMOUNT_DELTA) return false;
        const remaining = Number(inv.total || 0) - (paidBy.get(inv.id) ?? 0);
        if (remaining < amount - AMOUNT_DELTA) return false;
        return true;
      })
      .map(inv => ({
        invoice: inv,
        dateDelta: daysBetween(receipt.date, inv.date),
        remaining: Math.round((Number(inv.total || 0) - (paidBy.get(inv.id) ?? 0)) * 100) / 100,
      }));

    // Date-proximate matches first; unknown deltas last.
    list.sort((a, b) => {
      const da = a.dateDelta === null ? Number.MAX_SAFE_INTEGER : Math.abs(a.dateDelta);
      const db = b.dateDelta === null ? Number.MAX_SAFE_INTEGER : Math.abs(b.dateDelta);
      return da - db;
    });
    return list;
  }, [receipt, invoices]);

  if (!receipt) return null;

  const visible = showAll ? candidates : candidates.slice(0, 8);
  const closeMatchCount = candidates.filter(c => c.dateDelta !== null && Math.abs(c.dateDelta) <= DATE_TOLERANCE_DAYS).length;

  const link = async (invoiceId: string) => {
    setError(null);
    setBusyId(invoiceId);
    try {
      await api.post('/api/payment-links', { receiptId: receipt.id, invoiceId });
      setDone(true);
      setTimeout(onLinked, 700);
    } catch (e: any) {
      setError(e.message || 'Could not link the payment.');
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 transition-all"
      onClick={e => { if (e.target === e.currentTarget && !busyId) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Link payment to invoice"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-100 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between border-b border-slate-100 bg-indigo-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-100 text-indigo-600">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Link payment to an invoice</h3>
              <p className="text-xs text-slate-700">Confirm which invoice this payment settles — the link is audited.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={!!busyId}
            className="p-1.5 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-800">Payment linked</p>
              <p className="text-xs text-slate-700">The invoice\u2019s paid total now includes this payment.</p>
            </div>
          ) : (
            <>
              {/* Receipt summary */}
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-700 font-bold">Payment</p>
                  <p className="font-mono text-xs font-bold text-slate-800 break-all">{receipt.id}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-700 font-bold">Date</p>
                  <p className="font-semibold text-slate-800">{receipt.date || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-700 font-bold">Method</p>
                  <p className="font-semibold text-slate-800">{receipt.paymentMethod || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-700 font-bold">Amount</p>
                  <p className="font-bold text-indigo-700">${(receipt.total ?? 0).toLocaleString()}</p>
                </div>
              </div>

              {candidates.length === 0 ? (
                <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    No invoice matches this payment by client + amount. It may be a payment without a matching invoice —
                    consider reversing it instead.
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Candidate invoices <span className="text-slate-700 normal-case">({candidates.length}{closeMatchCount > 0 ? ` · ${closeMatchCount} within ${DATE_TOLERANCE_DAYS} days` : ''})</span>
                    </p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-700" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Filter by invoice id…"
                        className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 w-44"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {visible
                      .filter(c => !search || c.invoice.id.toLowerCase().includes(search.toLowerCase()))
                      .map(c => {
                        const within = c.dateDelta !== null && Math.abs(c.dateDelta) <= DATE_TOLERANCE_DAYS;
                        return (
                          <div key={c.invoice.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-800 break-all">{c.invoice.id}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : c.invoice.status === 'Overdue' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
                                  {c.invoice.status}
                                </span>
                                {within && (
                                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase">Date match</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-700">
                                <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{c.invoice.date || '—'}{c.dateDelta !== null ? ` (${Math.abs(c.dateDelta)}d diff)` : ''}</span>
                                <span>Total ${(c.invoice.total ?? 0).toLocaleString()}</span>
                                <span>Unpaid ${c.remaining.toLocaleString()}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => link(c.invoice.id)}
                              disabled={!!busyId}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                            >
                              {busyId === c.invoice.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                              Link
                            </button>
                          </div>
                        );
                      })}
                    {visible.filter(c => !search || c.invoice.id.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                      <p className="text-xs text-slate-700 py-2">No candidates match the filter.</p>
                    )}
                  </div>

                  {candidates.length > 8 && (
                    <button onClick={() => setShowAll(s => !s)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                      {showAll ? 'Show fewer' : `Show all ${candidates.length} candidates`}
                    </button>
                  )}
                </>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={onClose}
              disabled={!!busyId}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
