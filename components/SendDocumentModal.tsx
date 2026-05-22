import React, { useEffect, useState } from 'react';
import { X, Send, Plus, Mail } from 'lucide-react';
import { sendDocumentEmail } from '../services/documentEmail';

type DocType = 'contract' | 'invoice' | 'quotation' | 'receipt';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocType;
  documentId: string;
  documentLabel: string;        // e.g. "INV-1234" or "Contract C-9821"
  clientName: string;
  clientEmail?: string;
  defaultSubject: string;
  defaultMessage: string;
  onSent?: (info: { to: string }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Chip: React.FC<{ value: string; onRemove: () => void; tone?: 'indigo' | 'slate' }> = ({ value, onRemove, tone = 'indigo' }) => {
  const cls = tone === 'indigo'
    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
    : 'bg-slate-100 border-slate-200 text-slate-700';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${cls} text-xs font-medium`}>
      {value}
      <button type="button" onClick={onRemove} className="hover:bg-white/60 rounded-full p-0.5 transition-colors" aria-label={`Remove ${value}`}>
        <X size={12} />
      </button>
    </span>
  );
};

export const SendDocumentModal: React.FC<Props> = ({
  isOpen,
  onClose,
  documentType,
  documentId,
  documentLabel,
  clientName,
  clientEmail,
  defaultSubject,
  defaultMessage,
  onSent,
}) => {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const seedTo = clientEmail && EMAIL_RE.test(clientEmail) ? [clientEmail] : [];
      setTo(seedTo);
      setCc([]);
      setToInput('');
      setCcInput('');
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setError(null);
      setSending(false);
    }
  }, [isOpen, clientEmail, defaultSubject, defaultMessage]);

  if (!isOpen) return null;

  const addEmail = (raw: string, target: 'to' | 'cc') => {
    const value = raw.trim().replace(/[,;]+$/, '');
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setError(`"${value}" is not a valid email address.`);
      return;
    }
    setError(null);
    if (target === 'to') {
      if (!to.includes(value)) setTo([...to, value]);
      setToInput('');
    } else {
      if (!cc.includes(value)) setCc([...cc, value]);
      setCcInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, target: 'to' | 'cc') => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
      const value = (target === 'to' ? toInput : ccInput).trim();
      if (value) {
        e.preventDefault();
        addEmail(value, target);
      }
    } else if (e.key === 'Backspace') {
      const value = target === 'to' ? toInput : ccInput;
      if (!value) {
        if (target === 'to' && to.length > 0) setTo(to.slice(0, -1));
        else if (target === 'cc' && cc.length > 0) setCc(cc.slice(0, -1));
      }
    }
  };

  const handleSend = async () => {
    setError(null);
    const trimmedToInput = toInput.trim();
    const trimmedCcInput = ccInput.trim();
    const finalTo = [...to, ...(trimmedToInput ? [trimmedToInput] : [])];
    const finalCc = [...cc, ...(trimmedCcInput ? [trimmedCcInput] : [])];

    for (const e of [...finalTo, ...finalCc]) {
      if (!EMAIL_RE.test(e)) { setError(`"${e}" is not a valid email address.`); return; }
    }
    if (finalTo.length === 0) { setError('Add at least one recipient in the To field.'); return; }
    if (!subject.trim()) { setError('Subject cannot be empty.'); return; }

    setSending(true);
    const { error: sendErr, to: sentTo } = await sendDocumentEmail(documentType, documentId, {
      to: finalTo,
      cc: finalCc.length > 0 ? finalCc : undefined,
      subject: subject.trim(),
      customMessage: message.trim() || undefined,
    });
    setSending(false);

    if (sendErr) {
      setError(sendErr.message || 'Failed to send.');
      return;
    }
    onSent?.({ to: sentTo || finalTo.join(', ') });
    onClose();
  };

  const typeLabel = documentType.charAt(0).toUpperCase() + documentType.slice(1);

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
              <Mail size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Send {typeLabel}</h2>
              <p className="text-xs text-slate-900">{documentLabel} &middot; {clientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-2 text-slate-900 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* To */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">To</label>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition">
              {to.map((e) => <Chip key={e} value={e} onRemove={() => setTo(to.filter(x => x !== e))} />)}
              <input
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'to')}
                onBlur={() => { if (toInput.trim()) addEmail(toInput, 'to'); }}
                placeholder={to.length === 0 ? 'name@example.com' : 'add another…'}
                className="flex-1 min-w-[160px] outline-none text-sm text-slate-900 bg-transparent py-1"
                type="email"
              />
            </div>
            <p className="text-[11px] text-slate-900 mt-1">Press Enter, comma, or semicolon to add. Backspace removes the last chip.</p>
          </div>

          {/* CC */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">CC <span className="text-slate-900 font-normal lowercase">(optional)</span></label>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition">
              {cc.map((e) => <Chip key={e} value={e} onRemove={() => setCc(cc.filter(x => x !== e))} tone="slate" />)}
              <input
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'cc')}
                onBlur={() => { if (ccInput.trim()) addEmail(ccInput, 'cc'); }}
                placeholder={cc.length === 0 ? 'colleague@example.com' : 'add another…'}
                className="flex-1 min-w-[160px] outline-none text-sm text-slate-900 bg-transparent py-1"
                type="email"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-900 transition"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm text-slate-900 leading-relaxed resize-y transition"
            />
            <p className="text-[11px] text-slate-900 mt-1">Replaces the intro paragraph. The {documentType === 'contract' ? 'contract details' : 'itemised breakdown'} and PDF attachment are added automatically.</p>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center flex-shrink-0">
          <p className="text-[11px] text-slate-900">PDF will be attached automatically.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-5 py-2 rounded-xl text-sm font-medium text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send size={14} /> Send {typeLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SendDocumentModal;
