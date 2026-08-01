import React, { useState, useEffect, useMemo } from 'react';
import { Client, Contract, Invoice } from '../types';
import {
  getInvoices, getContracts, getBillboards, addInvoice, subscribe, deleteInvoice, getEffectiveVatRate,
} from '../services/mockData';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { splitInclusiveVat, formatVatPercent } from '../services/constants';
import {
  ArrowLeft, Edit2, Mail, Phone, User, Plus, X, FileText, Download, Trash2, CheckCircle, DollarSign, AlertCircle, Clock, Calendar,
} from 'lucide-react';
import { canDelete } from '../utils/settingsAccess';
import { getCurrentUser } from '../services/authServiceSecure';

interface Props {
  client: Client;
  onBack: () => void;
  onEdit: (client: Client) => void;
}

type LineItem = { description: string; amount: number };

const STATUS_STYLES: Record<Invoice['status'], string> = {
  Paid: 'bg-green-50 text-green-700 border-green-100',
  Pending: 'bg-amber-50 text-amber-700 border-amber-100',
  Overdue: 'bg-red-50 text-red-700 border-red-100',
};

export const ClientDetail: React.FC<Props> = ({ client, onBack, onEdit }) => {
  const canUserDelete = canDelete(getCurrentUser());
  const vatRate = getEffectiveVatRate();
  const vatPct = formatVatPercent(vatRate);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [tab, setTab] = useState<'Invoice' | 'Quotation' | 'Receipt'>('Invoice');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [docType, setDocType] = useState<'Invoice' | 'Quotation'>('Invoice');
  const [newDoc, setNewDoc] = useState<{
    date: string;
    contractId: string;
    hasVat: boolean;
    items: LineItem[];
  }>({
    date: new Date().toISOString().split('T')[0],
    contractId: '',
    hasVat: true,
    items: [{ description: '', amount: 0 }],
  });

  const refresh = () => {
    setInvoices(getInvoices().filter(i => i.clientId === client.id));
    setContracts(getContracts().filter(c => c.clientId === client.id));
  };

  useEffect(() => {
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const filteredDocs = useMemo(
    () => invoices.filter(i => i.type === tab).sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, tab]
  );

  const metrics = useMemo(() => {
    const invoicesOnly = invoices.filter(i => i.type === 'Invoice');
    const totalBilled = invoicesOnly.reduce((s, i) => s + i.total, 0);
    const paid = invoicesOnly.filter(i => i.status === 'Paid').reduce((s, i) => s + i.total, 0);
    const outstanding = invoicesOnly.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.total, 0);
    const activeContracts = contracts.filter(c => c.status === 'Active').length;
    return { totalBilled, paid, outstanding, activeContracts, invoiceCount: invoicesOnly.length };
  }, [invoices, contracts]);

  const openCreate = (t: 'Invoice' | 'Quotation') => {
    setDocType(t);
    setNewDoc({
      date: new Date().toISOString().split('T')[0],
      contractId: '',
      hasVat: true,
      items: [{ description: '', amount: 0 }],
    });
    setIsCreateOpen(true);
  };

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setNewDoc(prev => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }));
  };

  const addLine = () => setNewDoc(prev => ({ ...prev, items: [...prev.items, { description: '', amount: 0 }] }));
  const removeLine = (idx: number) =>
    setNewDoc(prev => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== idx) : prev.items,
    }));

  const gross = newDoc.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const { subtotal, vat } = newDoc.hasVat ? splitInclusiveVat(gross, vatRate) : { subtotal: gross, vat: 0 };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = newDoc.items.filter(i => i.description.trim() && i.amount > 0);
    if (validItems.length === 0) {
      alert('Add at least one line item with a description and amount.');
      return;
    }

    const doc: Invoice = {
      clientId: client.id,
      contractId: newDoc.contractId || undefined,
      date: newDoc.date,
      items: validItems.map(i => ({ description: i.description.trim(), amount: Number(i.amount) })),
      subtotal,
      vatAmount: vat,
      total: gross,
      status: 'Pending',
      type: docType,
    } as Invoice;
    try {
      await addInvoice(doc);
    } catch (err: any) {
      alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
      return;
    }
    setIsCreateOpen(false);
    setTab(docType);
  };

  const downloadPdf = (doc: Invoice) => {
    try {
      generateInvoicePDF(doc, client);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF.');
    }
  };

  const getBillboardName = (id?: string) => {
    if (!id) return '';
    const b = getBillboards().find(x => x.id === id);
    return b?.name || '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-900 hover:text-slate-900 text-sm font-semibold uppercase tracking-wider">
          <ArrowLeft size={16} /> Back to Directory
        </button>
        <div className="flex gap-3">
          <button onClick={() => onEdit(client)} className="bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
            <Edit2 size={14} /> Edit Client
          </button>
          <button onClick={() => openCreate('Quotation')} className="bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
            <FileText size={14} /> New Quotation
          </button>
          <button onClick={() => openCreate('Invoice')} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg">
            <Plus size={14} /> New Invoice
          </button>
        </div>
      </div>

      {/* Client Identity Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-8 shadow-xl">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center font-bold text-3xl shrink-0">
            {client.companyName.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold tracking-tight">{client.companyName}</h2>
            <p className="text-sm text-slate-300 mt-1 flex items-center gap-2"><User size={14} className="text-indigo-300"/> {client.contactPerson}</p>
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-300">
              <span className="flex items-center gap-2"><Mail size={14} className="text-slate-900" /> {client.email || '—'}</span>
              <span className="flex items-center gap-2"><Phone size={14} className="text-slate-900" /> {client.phone || '—'}</span>
              {client.billingDay && (
                <span className="flex items-center gap-2"><Calendar size={14} className="text-slate-900" /> Bills on day {client.billingDay}</span>
              )}
              <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${client.status === 'Active' ? 'bg-green-500/20 text-green-300' : 'bg-slate-500/20 text-slate-300'}`}>{client.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={<FileText size={16}/>} label="Active Contracts" value={metrics.activeContracts.toString()} tone="indigo" />
        <MetricCard icon={<DollarSign size={16}/>} label="Total Billed" value={`$${metrics.totalBilled.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="slate" />
        <MetricCard icon={<CheckCircle size={16}/>} label="Paid" value={`$${metrics.paid.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="green" />
        <MetricCard icon={<AlertCircle size={16}/>} label="Outstanding" value={`$${metrics.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone={metrics.outstanding > 0 ? 'amber' : 'slate'} />
      </div>

      {/* Active Contracts */}
      {contracts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Contracts ({contracts.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {contracts.map(c => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-slate-900 shrink-0">{c.id}</span>
                  <span className="font-semibold text-slate-800 truncate">{getBillboardName(c.billboardId) || 'Unknown Billboard'}</span>
                  <span className="text-xs text-slate-900 shrink-0">{c.details}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-slate-900">{c.startDate} → {c.endDate}</span>
                  <span className="font-bold text-slate-800">${c.totalContractValue.toLocaleString()}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${c.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' : c.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-900 border-slate-100'}`}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Financial Documents</h3>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-full">
            {(['Invoice', 'Quotation', 'Receipt'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-900 hover:text-slate-700'}`}>
                {t}s ({invoices.filter(i => i.type === t).length})
              </button>
            ))}
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-900">
            <FileText size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No {tab.toLowerCase()}s for this client yet.</p>
            {tab !== 'Receipt' && (
              <button onClick={() => openCreate(tab)} className="mt-4 text-indigo-600 hover:text-indigo-700 text-xs font-bold uppercase tracking-wider">
                Create First {tab}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-900">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-900">{doc.id}</td>
                    <td className="px-6 py-3 text-slate-900">{doc.date}</td>
                    <td className="px-6 py-3 text-slate-800 max-w-xs truncate">{doc.items[0]?.description || '—'}{doc.items.length > 1 ? ` +${doc.items.length - 1} more` : ''}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-900">${(doc.total ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_STYLES[doc.status]}`}>{doc.status}</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => downloadPdf(doc)} title="Download PDF" className="p-2 text-slate-900 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                          <Download size={14} />
                        </button>
                        {doc.type === 'Invoice' && doc.status !== 'Paid' && (
                          <button onClick={() => alert('Open Payments to record this receipt. Receiver, reference, receiving account and bank proof must be captured there.')} title="Record payment with audit evidence" className="p-2 text-slate-900 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors">
                            <CheckCircle size={14} />
                          </button>
                        )}
                        {canUserDelete && (
                          <button onClick={async () => { const reason = prompt(`Void ${doc.type} ${doc.id}? Enter the audit reason:`); if (reason) { try { await deleteInvoice(doc.id, reason); } catch (e: any) { alert(`Failed: ${e?.message || 'Server error. Please try again.'}`); } } }} title="Void with audit trail" className="p-2 text-slate-900 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">New {docType}</h3>
                <p className="text-xs text-slate-900 mt-0.5">For {client.companyName}</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Date</label>
                  <input type="date" required value={newDoc.date} onChange={e => setNewDoc({ ...newDoc, date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Link Contract (Optional)</label>
                  <select value={newDoc.contractId} onChange={e => setNewDoc({ ...newDoc, contractId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-medium bg-white">
                    <option value="">None</option>
                    {contracts.map(c => (
                      <option key={c.id} value={c.id}>{c.id} — {getBillboardName(c.billboardId)} ({c.details})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Line Items</p>
                  <button type="button" onClick={addLine} className="text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                    <Plus size={12} /> Add Line
                  </button>
                </div>
                <div className="space-y-3">
                  {newDoc.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input type="text" required placeholder="Description" value={item.description}
                        onChange={e => updateItem(idx, 'description', e.target.value)}
                        className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm" />
                      <input type="number" required placeholder="Amount" min={0} step="0.01" value={item.amount || ''}
                        onChange={e => updateItem(idx, 'amount', Number(e.target.value))}
                        className="w-32 px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-800 text-sm font-semibold" />
                      {newDoc.items.length > 1 && (
                        <button type="button" onClick={() => removeLine(idx)} className="p-2.5 text-slate-900 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newDoc.hasVat} onChange={e => setNewDoc({ ...newDoc, hasVat: e.target.checked })}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                <span className="text-sm font-medium text-slate-900">Amounts include VAT ({vatPct})</span>
              </label>

              {/* Summary */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
                {newDoc.hasVat && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Subtotal (excl. VAT)</span>
                      <span className="font-semibold">${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">VAT ({vatPct})</span>
                      <span className="font-semibold">${vat.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="border-t border-slate-700 pt-2 flex justify-between">
                  <span className="text-sm font-bold uppercase tracking-wider">Total</span>
                  <span className="text-xl font-black">${gross.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg flex items-center justify-center gap-2">
                  <CheckCircle size={14} /> Create {docType}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; tone: 'indigo' | 'green' | 'amber' | 'slate' }> = ({ icon, label, value, tone }) => {
  const tones: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    slate: 'bg-slate-50 text-slate-900 border-slate-100',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${tones[tone]}`}>{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
};
