import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, ShieldCheck, Receipt, FileText, CheckCircle2 } from 'lucide-react';
import { deleteInvoice } from '../services/mockData';

export interface VoidDocument {
  id: string;
  type: 'Receipt' | 'Invoice';
  amount: number;
  date: string;
  clientName: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  proofExists?: boolean;
}

interface Props {
  document: VoidDocument | null;
  onClose: () => void;
  onVoided: () => void;
}

const MIN_REASON_LENGTH = 10;

/**
 * Void a financial document (payment/receipt or invoice) with a mandatory
 * audit reason. The server marks the row isVoided + stores the reason; the
 * original document and payment proof are preserved for the audit trail.
 */
export const VoidDocumentModal: React.FC<Props> = ({ document, onClose, onVoided }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (!document) return null;

  const isPayment = document.type === 'Receipt';
  const remaining = MIN_REASON_LENGTH - reason.trim().length;
  const canSubmit = reason.trim().length >= MIN_REASON_LENGTH && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    try {
      await deleteInvoice(document.id, reason.trim());
      setDone(true);
      setTimeout(() => {
        setSaving(false);
        onVoided();
      }, 600);
    } catch (err: any) {
      setError(err?.message || 'Server error. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 transition-all"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={isPayment ? 'Reverse payment' : 'Void invoice'}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className={`px-6 py-5 flex items-start justify-between border-b border-slate-100 ${isPayment ? 'bg-red-50/60' : 'bg-amber-50/60'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isPayment ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
              {isPayment ? <Receipt className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {isPayment ? 'Reverse this payment?' : 'Void this invoice?'}
              </h3>
              <p className="text-xs text-slate-500">An audit reason is required — this action cannot be undone.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document summary */}
        <div className="px-6 py-5 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-800">{isPayment ? 'Payment reversed' : 'Invoice voided'}</p>
              <p className="text-xs text-slate-500">The document has been marked void with your reason on the audit trail.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Document</span>
                  <span className="font-mono text-xs font-bold text-slate-800 break-all text-right">{document.id}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Date</span>
                  <span className="font-semibold text-slate-800">{document.date}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Client</span>
                  <span className="font-semibold text-slate-800">{document.clientName || '—'}</span>
                </div>
                {document.paymentMethod && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Method</span>
                    <span className="font-semibold text-slate-800">{document.paymentMethod}</span>
                  </div>
                )}
                {document.paymentReference && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Reference</span>
                    <span className="font-mono text-xs font-semibold text-slate-800">{document.paymentReference}</span>
                  </div>
                )}
                {document.proofExists !== undefined && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Payment proof</span>
                    <span className={`font-semibold ${document.proofExists ? "text-emerald-600" : "text-red-500"}`}>
                      {document.proofExists ? "Attached" : "None"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4 pt-2 border-t border-slate-100">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-bold text-red-600">${(document.amount ?? 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <ShieldCheck className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  The original {isPayment ? 'receipt and any payment proof' : 'invoice'} are preserved for audit.
                  {isPayment ? ' The amount is removed from the invoice\u2019s paid total.' : ''}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Audit reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => { setReason(e.target.value); setError(null); }}
                  rows={3}
                  autoFocus
                  maxLength={300}
                  placeholder={isPayment
                    ? 'e.g. Payment recorded against the wrong invoice — reversed by request of finance'
                    : 'e.g. Duplicate invoice created in error — never sent to the client'}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-red-400 focus:ring-2 focus:ring-red-500/10 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${remaining > 0 ? 'text-slate-400' : 'text-emerald-600 font-semibold'}`}>
                    {remaining > 0 ? `${remaining} more character${remaining === 1 ? '' : 's'} needed` : 'Reason looks good'}
                  </span>
                  <span className="text-[11px] text-slate-400">{reason.trim().length}/300</span>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 shadow-sm shadow-red-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {isPayment ? 'Reverse Payment' : 'Void Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
