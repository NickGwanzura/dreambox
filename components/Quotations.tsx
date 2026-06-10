import React, { useState, useEffect, useMemo } from 'react';
import {
  getInvoices, getClients, getBillboards, addInvoice, updateInvoice, deleteInvoice,
  addContract, subscribe, getNextQuoteNumber, duplicateQuotation,
  convertQuotationToInvoice, markQuotationSent, markQuotationStatus
} from '../services/mockData';
import { calculateContractMonths } from '../utils/contractDate';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { sendDocumentEmail } from '../services/documentEmail';
import { SendDocumentModal } from './SendDocumentModal';
import {
  Download, Plus, X, Save, Search, Trash2, FileText, Send, Edit,
  Copy, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle,
  RefreshCw, MessageCircle, DollarSign, Eye
} from 'lucide-react';
import { Invoice, Contract, BillboardType, QuoteStatus, Client } from '../types';
import { splitInclusiveVat, formatVatPercent } from '../services/constants';
import { getEffectiveVatRate } from '../services/mockData';
import { canDelete, canCreateQuotations, canApproveQuotations, canSendQuotations } from '../utils/settingsAccess';
import { getCurrentUser } from '../services/authServiceSecure';
import { BillboardCatalogue } from './quotations/BillboardCatalogue';
import { QuotationTimeline } from './quotations/QuotationTimeline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

type InvoiceLineItem = Invoice['items'][number];

const MinimalInput = ({ label, value, onChange, type = "text", required = false, disabled = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} disabled={disabled} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:text-slate-900 disabled:cursor-not-allowed" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalTextarea = ({ label, value, onChange, rows = 3, required = false, disabled = false }: any) => (
  <div className="group relative">
    <textarea rows={rows} required={required} disabled={disabled} value={value} onChange={onChange} placeholder=" " className="peer w-full resize-none px-0 py-3 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:text-slate-900 disabled:cursor-not-allowed" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalSelect = ({ label, value, onChange, options, disabled = false }: any) => (
  <div className="group relative">
    <select value={value} disabled={disabled} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer disabled:text-slate-900 disabled:cursor-not-allowed" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  Draft: { label: 'Draft', bg: 'bg-slate-100', text: 'text-slate-700', icon: Clock },
  Sent: { label: 'Sent', bg: 'bg-indigo-100', text: 'text-indigo-700', icon: Send },
  Accepted: { label: 'Accepted', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  Rejected: { label: 'Rejected', bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  Expired: { label: 'Expired', bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertCircle },
  Converted: { label: 'Converted', bg: 'bg-purple-100', text: 'text-purple-700', icon: RefreshCw },
};

export const Quotations: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>(getInvoices());
  const [allClients, setAllClients] = useState<Client[]>(getClients());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Invoice | null>(null);
  const [convertingQuotation, setConvertingQuotation] = useState<Invoice | null>(null);
  const [convertForm, setConvertForm] = useState({ billboardId: '', startDate: '', endDate: '' });
  const [sendModal, setSendModal] = useState<{ doc: Invoice; client: Client } | null>(null);
  const [viewingQuotation, setViewingQuotation] = useState<Invoice | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [formData, setFormData] = useState<Partial<Invoice>>({
    clientId: '', items: [], date: new Date().toISOString().split('T')[0], status: 'Pending', contractId: ''
  });
  const [newItem, setNewItem] = useState({ description: '', amount: 0 });
  const [hasVat, setHasVat] = useState(true);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountDescription, setDiscountDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    setInvoices(getInvoices());
    setAllClients(getClients());
  }, [isModalOpen]);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setInvoices(getInvoices());
      setAllClients(getClients());
    });
    return () => unsubscribe();
  }, []);

  const quotations = useMemo(() =>
    invoices.filter(i => String(i.type).toLowerCase() === 'quotation'),
    [invoices]
  );

  const filteredQuotations = useMemo(() => {
    let result = quotations;
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(q =>
        (q.quoteNumber || q.id).toLowerCase().includes(lower) ||
        (allClients.find(c => c.id === q.clientId)?.companyName || '').toLowerCase().includes(lower)
      );
    }
    if (statusFilter !== 'All') {
      result = result.filter(q => q.quoteStatus === statusFilter);
    }
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [quotations, searchTerm, statusFilter, allClients]);

  const stats = useMemo(() => {
    const total = quotations.length;
    const draft = quotations.filter(q => q.quoteStatus === 'Draft').length;
    const sent = quotations.filter(q => q.quoteStatus === 'Sent').length;
    const accepted = quotations.filter(q => q.quoteStatus === 'Accepted').length;
    const rejected = quotations.filter(q => q.quoteStatus === 'Rejected').length;
    const expired = quotations.filter(q => q.quoteStatus === 'Expired').length;
    const converted = quotations.filter(q => q.quoteStatus === 'Converted').length;
    const totalValue = quotations.reduce((sum, q) => sum + (q.total || 0), 0);
    const conversionRate = sent > 0 ? Math.round((accepted + converted) / sent * 100) : 0;
    return { total, draft, sent, accepted, rejected, expired, converted, totalValue, conversionRate };
  }, [quotations]);

  const pipelineData = useMemo(() => [
    { name: 'Draft', value: stats.draft, fill: '#64748b' },
    { name: 'Sent', value: stats.sent, fill: '#6366f1' },
    { name: 'Accepted', value: stats.accepted, fill: '#10b981' },
    { name: 'Rejected', value: stats.rejected, fill: '#ef4444' },
    { name: 'Expired', value: stats.expired, fill: '#f59e0b' },
    { name: 'Converted', value: stats.converted, fill: '#8b5cf6' },
  ], [stats]);

  const monthlyTrendData = useMemo(() => {
    const months: Record<string, { month: string; created: number; sent: number; accepted: number; converted: number }> = {};
    quotations.forEach(q => {
      const key = q.date.slice(0, 7);
      if (!months[key]) {
        const [y, m] = key.split('-');
        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        months[key] = { month: monthName, created: 0, sent: 0, accepted: 0, converted: 0 };
      }
      months[key].created++;
      if (q.quoteStatus === 'Sent') months[key].sent++;
      if (q.quoteStatus === 'Accepted') months[key].accepted++;
      if (q.quoteStatus === 'Converted') months[key].converted++;
    });
    return Object.values(months).sort((a, b) => {
      const keys = Object.keys(months);
      return keys.indexOf(keys.find(k => months[k] === a)!) - keys.indexOf(keys.find(k => months[k] === b)!);
    }).slice(-6);
  }, [quotations]);

  const valueByStatusData = useMemo(() => [
    { name: 'Draft', value: quotations.filter(q => q.quoteStatus === 'Draft').reduce((s, q) => s + q.total, 0) },
    { name: 'Sent', value: quotations.filter(q => q.quoteStatus === 'Sent').reduce((s, q) => s + q.total, 0) },
    { name: 'Accepted', value: quotations.filter(q => q.quoteStatus === 'Accepted').reduce((s, q) => s + q.total, 0) },
    { name: 'Converted', value: quotations.filter(q => q.quoteStatus === 'Converted').reduce((s, q) => s + q.total, 0) },
  ], [quotations]);

  const grossItems = formData.items?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const rawDiscountAmount = discountType === 'percentage' ? grossItems * (discountValue / 100) : discountValue;
  const discountAmount = Math.min(grossItems, Math.max(0, rawDiscountAmount || 0));
  const grossAfterDiscount = Math.max(0, grossItems - discountAmount);
  const vatRate = getEffectiveVatRate();
  const vatPct = formatVatPercent(vatRate);
  const { subtotal: taxableSubtotal, vat: vatAmount } = hasVat
    ? splitInclusiveVat(grossAfterDiscount, vatRate)
    : { subtotal: grossAfterDiscount, vat: 0 };
  const subtotal = taxableSubtotal;
  const total = grossAfterDiscount;

  const resetForm = () => {
    setFormData({ clientId: '', items: [], date: new Date().toISOString().split('T')[0], status: 'Pending', contractId: '' });
    setNewItem({ description: '', amount: 0 });
    setHasVat(true);
    setDiscountType('amount');
    setDiscountValue(0);
    setDiscountDescription('');
    setExpiryDate('');
    setTerms('');
    setNotes('');
    setEditingQuotation(null);
    setConvertingQuotation(null);
    setConvertForm({ billboardId: '', startDate: '', endDate: '' });
  };

  const addItem = () => {
    const trimmedDescription = newItem.description.trim();
    if (trimmedDescription && newItem.amount > 0) {
      setFormData({ ...formData, items: [...(formData.items || []), { description: trimmedDescription, amount: newItem.amount }] });
      setNewItem({ description: '', amount: 0 });
    }
  };

  const updateItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const updatedItems = [...(formData.items || [])];
    updatedItems[index] = { ...updatedItems[index], [field]: field === 'amount' ? Number(value) || 0 : String(value) };
    setFormData({ ...formData, items: updatedItems });
  };

  const removeItem = (index: number) => {
    setFormData({ ...formData, items: (formData.items || []).filter((_, i) => i !== index) });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateQuotations(currentUser)) {
      alert('You do not have permission to create quotations.');
      return;
    }
    if (editingQuotation) {
      const updated: Invoice = {
        ...editingQuotation,
        clientId: formData.clientId!,
        date: formData.date!,
        items: formData.items || [],
        subtotal,
        discountAmount,
        discountDescription: discountAmount > 0 ? discountDescription.trim() || undefined : undefined,
        vatAmount,
        total,
        expiryDate: expiryDate || undefined,
        terms: terms || undefined,
        notes: notes || undefined,
      };
      updateInvoice(updated);
      setInvoices(getInvoices());
      setIsModalOpen(false);
      resetForm();
      alert('Quotation Updated Successfully!');
    } else {
      const newDoc: Invoice = {
        id: `QT-${Date.now().toString().slice(-6)}`,
        clientId: formData.clientId!,
        date: formData.date!,
        items: formData.items || [],
        subtotal,
        discountAmount,
        discountDescription: discountAmount > 0 ? discountDescription.trim() || undefined : undefined,
        vatAmount,
        total,
        status: 'Pending',
        type: 'Quotation',
        quoteNumber: getNextQuoteNumber(),
        expiryDate: expiryDate || undefined,
        terms: terms || undefined,
        notes: notes || undefined,
        quoteStatus: 'Draft',
      };
      addInvoice(newDoc);
      setInvoices(getInvoices());
      setIsModalOpen(false);
      resetForm();
      alert('Quotation Created Successfully!');
    }
  };

  const handleEdit = (doc: Invoice) => {
    setEditingQuotation(doc);
    setFormData({
      clientId: doc.clientId,
      items: [...doc.items],
      date: doc.date,
      status: doc.status,
      contractId: doc.contractId || '',
    });
    setHasVat(doc.vatAmount > 0);
    if (doc.discountAmount && doc.discountAmount > 0) {
      setDiscountType('amount');
      setDiscountValue(doc.discountAmount);
      setDiscountDescription(doc.discountDescription || '');
    } else {
      setDiscountType('amount');
      setDiscountValue(0);
      setDiscountDescription('');
    }
    setExpiryDate(doc.expiryDate || '');
    setTerms(doc.terms || '');
    setNotes(doc.notes || '');
    setNewItem({ description: '', amount: 0 });
    setIsModalOpen(true);
  };

  const handleDelete = (doc: Invoice) => {
    if (!canDelete(currentUser)) {
      alert('You do not have permission to delete quotations.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete quotation ${doc.quoteNumber || doc.id}? This action cannot be undone.`)) {
      deleteInvoice(doc.id);
      setInvoices(getInvoices());
    }
  };

  const handleDuplicate = async (doc: Invoice) => {
    if (!canCreateQuotations(currentUser)) {
      alert('You do not have permission to duplicate quotations.');
      return;
    }
    const dup = await duplicateQuotation(doc.id);
    if (dup) {
      setInvoices(getInvoices());
      alert(`Quotation duplicated: ${dup.quoteNumber || dup.id}`);
    }
  };

  const handleConvertToInvoice = async (doc: Invoice) => {
    if (!canApproveQuotations(currentUser)) {
      alert('Only Admin or Manager can convert quotations to invoices.');
      return;
    }
    if (!window.confirm(`Convert quotation ${doc.quoteNumber || doc.id} to an invoice?`)) return;
    const inv = await convertQuotationToInvoice(doc.id);
    if (inv) {
      setInvoices(getInvoices());
      alert(`Converted to Invoice ${inv.id}`);
    }
  };

  const handleConvertToContract = (doc: Invoice) => {
    if (!canApproveQuotations(currentUser)) {
      alert('Only Admin or Manager can convert quotations to contracts.');
      return;
    }
    setConvertingQuotation(doc);
  };

  const handleConvertToContractSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingQuotation || !convertForm.billboardId || !convertForm.startDate || !convertForm.endDate) return;
    const bb = getBillboards().find(b => b.id === convertForm.billboardId);
    const monthlyRate = convertingQuotation.items[0]?.amount || 0;
    let months: number;
    try {
      months = calculateContractMonths(convertForm.startDate, convertForm.endDate);
    } catch {
      months = Math.max(1, Math.ceil((new Date(convertForm.endDate).getTime() - new Date(convertForm.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)));
    }
    const gross = monthlyRate * months;
    const contract: Contract = {
      id: `C-${Date.now().toString().slice(-4)}`,
      clientId: convertingQuotation.clientId,
      billboardId: convertForm.billboardId,
      startDate: convertForm.startDate,
      endDate: convertForm.endDate,
      monthlyRate,
      installationCost: 0,
      printingCost: 0,
      hasVat: convertingQuotation.vatAmount > 0,
      totalContractValue: gross,
      status: 'Active',
      details: bb?.type === BillboardType.LED ? 'Slot 1' : 'Side A',
      createdAt: new Date().toISOString(),
    };
    try {
      addContract(contract);
      const updatedQuotation: Invoice = {
        ...convertingQuotation,
        quoteStatus: 'Converted',
        convertedToContractId: contract.id,
        convertedAt: new Date().toISOString(),
      };
      updateInvoice(updatedQuotation);
      setInvoices(getInvoices());
      setConvertingQuotation(null);
      setConvertForm({ billboardId: '', startDate: '', endDate: '' });
      alert(`Contract ${contract.id} created. Quotation preserved.`);
    } catch (err) {
      console.error('Failed to convert:', err);
      alert('Failed to create contract.');
    }
  };

  const downloadPDF = (doc: Invoice) => {
    const client = allClients.find(c => c.id === doc.clientId);
    if (client) { generateInvoicePDF(doc, client); }
    else { alert(`Client data missing for ID ${doc.clientId}`); }
  };

  const handleSendDoc = (doc: Invoice) => {
    if (!canSendQuotations(currentUser)) {
      alert('You do not have permission to send quotations.');
      return;
    }
    const client = allClients.find(c => c.id === doc.clientId);
    if (!client) { alert('Client not found'); return; }
    setSendModal({ doc, client });
  };

  const handleWhatsAppShare = (doc: Invoice) => {
    if (!canSendQuotations(currentUser)) {
      alert('You do not have permission to share quotations.');
      return;
    }
    const client = allClients.find(c => c.id === doc.clientId);
    if (!client?.phone) { alert('Client phone number not found'); return; }
    const message = `Hi ${client.contactPerson}, please find your quotation from Dreambox Advertising: ${doc.quoteNumber || doc.id} — $${doc.total.toLocaleString()}. Valid until ${doc.expiryDate || '30 days from now'}.`;
    const url = `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    markQuotationSent(doc.id, client.phone);
    setInvoices(getInvoices());
  };

  const handleMarkStatus = async (doc: Invoice, status: QuoteStatus) => {
    if (!canApproveQuotations(currentUser)) {
      alert('Only Admin or Manager can change quotation status.');
      return;
    }
    await markQuotationStatus(doc.id, status);
    setInvoices(getInvoices());
  };

  const handleView = (doc: Invoice) => {
    setViewingQuotation(doc);
  };

  const buildDocSendDefaults = (doc: Invoice) => {
    const brand = 'Dreambox Advertising';
    const subject = `Quotation #${doc.quoteNumber || doc.id.slice(0, 8)} — $${doc.total.toLocaleString()} | ${brand}`;
    const message = `Please find your quotation from ${brand} below.${doc.expiryDate ? ` This quote is valid until ${doc.expiryDate}.` : ' This quote is valid for 30 days.'} A PDF copy is attached.`;
    return { subject, message };
  };

  const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900">{label}</p>
        <p className="text-xl font-black text-slate-900">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Quotations</h2>
          <p className="text-slate-900 font-medium">Create, send, and track quotations. Convert accepted quotes to invoices or contracts.</p>
        </div>
        {canCreateQuotations(currentUser) && (
          <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg transition-all hover:scale-105">
            <Plus size={16} /> <span className="hidden sm:inline">New Quotation</span><span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Quotes" value={stats.total} icon={FileText} color="bg-slate-800" />
        <StatCard label="Draft" value={stats.draft} icon={Clock} color="bg-slate-500" />
        <StatCard label="Sent" value={stats.sent} icon={Send} color="bg-indigo-500" />
        <StatCard label="Accepted" value={stats.accepted} icon={CheckCircle} color="bg-green-500" />
        <StatCard label="Rejected" value={stats.rejected} icon={XCircle} color="bg-red-500" />
        <StatCard label="Expired" value={stats.expired} icon={AlertCircle} color="bg-amber-500" />
        <StatCard label="Converted" value={stats.converted} icon={RefreshCw} color="bg-purple-500" />
        <StatCard label="Conversion Rate" value={`${stats.conversionRate}%`} icon={TrendingUp} color="bg-emerald-500" />
      </div>

      {/* Analytics Toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="text-sm font-bold uppercase tracking-wider text-slate-900 hover:text-slate-700 flex items-center gap-2 transition-all"
        >
          <TrendingUp size={16} /> {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
        </button>
      </div>

      {/* Analytics Charts */}
      {showAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-4">Quote Pipeline</h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineData} layout="vertical" margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#64748b' }} width={60} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {pipelineData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-4">Monthly Trend</h4>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyTrendData} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Line type="monotone" dataKey="created" stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} name="Created" />
                <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Sent" />
                <Line type="monotone" dataKey="accepted" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Accepted" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-4">Value by Status</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={valueByStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => value > 0 ? `$${(value / 1000).toFixed(0)}k` : ''}
                  labelLine={false}
                >
                  <Cell fill="#64748b" />
                  <Cell fill="#6366f1" />
                  <Cell fill="#10b981" />
                  <Cell fill="#8b5cf6" />
                </Pie>
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex gap-4 w-full sm:w-auto">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-3 top-3 text-slate-900" size={18} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search quote #, client..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-full bg-white outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all text-sm" />
          </div>
          <div className="relative">
            <MinimalSelect label="Status" value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)} options={[
              { value: 'All', label: 'All Statuses' },
              { value: 'Draft', label: 'Draft' },
              { value: 'Sent', label: 'Sent' },
              { value: 'Accepted', label: 'Accepted' },
              { value: 'Rejected', label: 'Rejected' },
              { value: 'Expired', label: 'Expired' },
              { value: 'Converted', label: 'Converted' },
            ]} />
          </div>
        </div>
        <div className="text-sm text-slate-900 font-medium">
          Total Quoted Value: <span className="font-bold text-slate-900">${stats.totalValue.toLocaleString()}</span>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden grid grid-cols-1 gap-4">
        {filteredQuotations.length > 0 ? filteredQuotations.map(doc => {
          const client = allClients.find(c => c.id === doc.clientId);
          const statusCfg = STATUS_CONFIG[doc.quoteStatus || 'Draft'] || STATUS_CONFIG.Draft;
          const StatusIcon = statusCfg.icon;
          return (
            <div key={doc.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-900">{doc.quoteNumber || doc.id}</p>
                  <p className="text-xs text-slate-900">{client?.companyName || 'Unknown'}</p>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${statusCfg.bg} ${statusCfg.text}`}>
                  <StatusIcon size={10} /> {doc.quoteStatus}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-900">Date</span>
                <span className="font-medium">{doc.date}</span>
              </div>
              {doc.expiryDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-900">Valid Until</span>
                  <span className="font-medium text-amber-600">{doc.expiryDate}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-900">Total</span>
                <span className="font-bold">${doc.total.toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => handleView(doc)} className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg" title="View Details"><Eye size={16} /></button>
                <button onClick={() => downloadPDF(doc)} className="p-2 text-slate-900 bg-slate-50 hover:bg-slate-200 rounded-lg" title="Download PDF"><Download size={16} /></button>
                <button onClick={() => handleSendDoc(doc)} className="p-2 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 rounded-lg" title="Send Email"><Send size={16} /></button>
                <button onClick={() => handleWhatsAppShare(doc)} className="p-2 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="WhatsApp"><MessageCircle size={16} /></button>
                <button onClick={() => handleEdit(doc)} className="p-2 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg" title="Edit"><Edit size={16} /></button>
                <button onClick={() => handleDuplicate(doc)} className="p-2 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Duplicate"><Copy size={16} /></button>
                {(doc.quoteStatus === 'Sent' || doc.quoteStatus === 'Accepted') && (
                  <button onClick={() => handleConvertToInvoice(doc)} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg" title="Convert to Invoice"><DollarSign size={16} /></button>
                )}
                {canDelete(currentUser) && (
                  <button onClick={() => handleDelete(doc)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg" title="Delete"><Trash2 size={16} /></button>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="py-12 text-center text-slate-900 italic">No quotations found.</div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-900 min-w-[800px]">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Quote #</th>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Date</th>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Client</th>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Valid Until</th>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Total</th>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-center">Status</th>
                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuotations.length > 0 ? filteredQuotations.map((doc) => {
                const client = allClients.find(c => c.id === doc.clientId);
                const statusCfg = STATUS_CONFIG[doc.quoteStatus || 'Draft'] || STATUS_CONFIG.Draft;
                const StatusIcon = statusCfg.icon;
                return (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{doc.quoteNumber || doc.id}</td>
                    <td className="px-6 py-4">{doc.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{client?.companyName || 'Unknown Client'}</span>
                        <span className="text-[10px] text-slate-900">{client?.contactPerson}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">{doc.expiryDate || '-'}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">${doc.total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 ${statusCfg.bg} ${statusCfg.text}`}>
                        <StatusIcon size={10} /> {doc.quoteStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-1 flex-wrap">
                        <button onClick={() => handleView(doc)} className="p-2 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" title="View Details"><Eye size={16} /></button>
                        <button onClick={() => downloadPDF(doc)} className="p-2 text-slate-900 hover:text-slate-900 bg-slate-50 hover:bg-slate-200 rounded-lg transition-colors" title="Download PDF"><Download size={16} /></button>
                        <button onClick={() => handleSendDoc(doc)} className="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors" title="Send via Email"><Send size={16} /></button>
                        <button onClick={() => handleWhatsAppShare(doc)} className="p-2 text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors" title="Share via WhatsApp"><MessageCircle size={16} /></button>
                        <button onClick={() => handleEdit(doc)} className="p-2 text-amber-500 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors" title="Edit"><Edit size={16} /></button>
                        <button onClick={() => handleDuplicate(doc)} className="p-2 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" title="Duplicate"><Copy size={16} /></button>
                        {(doc.quoteStatus === 'Sent' || doc.quoteStatus === 'Accepted') && (
                          <button onClick={() => handleConvertToInvoice(doc)} className="p-2 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors" title="Convert to Invoice"><DollarSign size={16} /></button>
                        )}
                        {canApproveQuotations(currentUser) && doc.quoteStatus !== 'Converted' && (
                          <>
                            <button onClick={() => handleMarkStatus(doc, 'Accepted')} className="p-2 text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors" title="Mark Accepted"><CheckCircle size={16} /></button>
                            <button onClick={() => handleMarkStatus(doc, 'Rejected')} className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Mark Rejected"><XCircle size={16} /></button>
                          </>
                        )}
                        {canDelete(currentUser) && (
                          <button onClick={() => handleDelete(doc)} className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Delete"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-900 italic">No quotations found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)} />
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all w-full sm:my-8 sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl border border-white/20 max-h-[92vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <h3 className="text-xl font-bold text-slate-900">{editingQuotation ? 'Edit Quotation' : 'Create New Quotation'}</h3>
                <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
              </div>
              <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <MinimalSelect label="Client" value={formData.clientId} onChange={(e: any) => setFormData({...formData, clientId: e.target.value})} options={[{value: '', label: 'Select Client...'}, ...allClients.map(c => ({value: c.id, label: c.companyName}))]} />
                  <MinimalInput label="Date" type="date" value={formData.date} onChange={(e: any) => setFormData({...formData, date: e.target.value})} />
                  <MinimalInput label="Expiry Date" type="date" value={expiryDate} onChange={(e: any) => setExpiryDate(e.target.value)} />
                </div>

                {/* Line Items */}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 space-y-3 border border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Line Items</h4>
                  
                  <BillboardCatalogue onAddItems={(items) => {
                    setFormData(prev => ({ ...prev, items: [...(prev.items || []), ...items] }));
                  }} />
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-900">Or Add Custom Line</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
                    <div className="flex-1"><MinimalTextarea label="Description / Details" value={newItem.description} onChange={(e: any) => setNewItem({...newItem, description: e.target.value})} rows={2} /></div>
                    <div><MinimalInput label="Amount ($)" type="number" value={newItem.amount} onChange={(e: any) => setNewItem({...newItem, amount: Number(e.target.value)})} /></div>
                    <button type="button" onClick={addItem} className="bg-slate-900 text-white rounded-xl px-4 py-3 hover:bg-slate-800 flex items-center justify-center gap-2"><Plus size={18}/> Add</button>
                  </div>
                  {formData.items && formData.items.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {formData.items.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">Line Item {idx + 1}</span>
                            <button type="button" onClick={() => removeItem(idx)} className="p-2 text-slate-900 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove line item">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <MinimalTextarea label="Description / Details" value={item.description} onChange={(e: any) => updateItem(idx, 'description', e.target.value)} rows={2} />
                          <div className="w-full md:w-40">
                            <MinimalInput label="Amount ($)" type="number" value={item.amount} onChange={(e: any) => updateItem(idx, 'amount', e.target.value)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Discount</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <MinimalSelect label="Discount Type" value={discountType} onChange={(e: any) => setDiscountType(e.target.value)} options={[{ value: 'amount', label: 'Fixed Amount' }, { value: 'percentage', label: 'Percentage %' }]} />
                    <MinimalInput label={discountType === 'percentage' ? 'Discount %' : 'Discount Amount ($)'} type="number" value={discountValue} onChange={(e: any) => setDiscountValue(Number(e.target.value))} />
                  </div>
                  <MinimalInput label="Discount Note (Optional)" value={discountDescription} onChange={(e: any) => setDiscountDescription(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={hasVat} onChange={e => setHasVat(e.target.checked)} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                  <label className="text-sm font-medium text-slate-900">Amounts include VAT ({vatPct})</label>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Quotation Details</h4>
                  <MinimalTextarea label="Terms & Conditions" value={terms} onChange={(e: any) => setTerms(e.target.value)} rows={2} />
                  <MinimalTextarea label="Internal Notes (not shown on PDF)" value={notes} onChange={(e: any) => setNotes(e.target.value)} rows={2} />
                </div>
                <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Subtotal</span>
                    <span className="font-semibold">${subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Discount</span>
                    <span className="font-semibold">-${discountAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">VAT</span>
                    <span className="font-semibold">${vatAmount.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider">Total</span>
                    <span className="text-xl font-black">${total.toLocaleString()}</span>
                  </div>
                </div>
                <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all">
                  <Save size={18} /> {editingQuotation ? 'Update Quotation' : 'Save Quotation'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Detail Panel */}
      {viewingQuotation && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setViewingQuotation(null)} />
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-3xl lg:max-w-4xl border border-white/20 max-h-[92vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Quotation Details</h3>
                  <p className="text-xs text-slate-900 mt-0.5">{viewingQuotation.quoteNumber || viewingQuotation.id}</p>
                </div>
                <button onClick={() => setViewingQuotation(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
              </div>
              <div className="p-6 space-y-4">
                {(() => {
                  const client = allClients.find(c => c.id === viewingQuotation.clientId);
                  const statusCfg = STATUS_CONFIG[viewingQuotation.quoteStatus || 'Draft'] || STATUS_CONFIG.Draft;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusCfg.bg} ${statusCfg.text}`}>
                          <StatusIcon size={14} /> {viewingQuotation.quoteStatus}
                        </span>
                        {viewingQuotation.expiryDate && (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700">
                            Valid until {viewingQuotation.expiryDate}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-3">Client</h4>
                          <p className="text-sm font-bold text-slate-800">{client?.companyName || 'Unknown'}</p>
                          <p className="text-xs text-slate-900">{client?.contactPerson}</p>
                          <p className="text-xs text-slate-900">{client?.email}</p>
                          <p className="text-xs text-slate-900">{client?.phone}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-3">Details</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between"><span className="text-slate-900">Date</span><span className="font-medium">{viewingQuotation.date}</span></div>
                            <div className="flex justify-between"><span className="text-slate-900">Total</span><span className="font-bold">${viewingQuotation.total.toLocaleString()}</span></div>
                            {viewingQuotation.convertedToInvoiceId && (
                              <div className="flex justify-between"><span className="text-slate-900">Converted to Invoice</span><span className="font-medium text-purple-600">{viewingQuotation.convertedToInvoiceId}</span></div>
                            )}
                            {viewingQuotation.convertedToContractId && (
                              <div className="flex justify-between"><span className="text-slate-900">Converted to Contract</span><span className="font-medium text-purple-600">{viewingQuotation.convertedToContractId}</span></div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-3">Line Items</h4>
                        <div className="space-y-2">
                          {viewingQuotation.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm py-2 border-b border-slate-200 last:border-0">
                              <span className="text-slate-800">{item.description}</span>
                              <span className="font-bold">${item.amount.toLocaleString()}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-bold pt-2">
                            <span>Total</span>
                            <span>${viewingQuotation.total.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      {viewingQuotation.terms && (
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-2">Terms & Conditions</h4>
                          <p className="text-xs text-slate-800 whitespace-pre-wrap">{viewingQuotation.terms}</p>
                        </div>
                      )}
                      <QuotationTimeline invoiceId={viewingQuotation.id} />
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Contract Modal */}
      {convertingQuotation && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setConvertingQuotation(null)} />
          <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div><h3 className="text-xl font-bold text-slate-900">Convert Quotation to Contract</h3><p className="text-xs text-slate-900 mt-0.5">{convertingQuotation.quoteNumber || convertingQuotation.id} — {allClients.find(c => c.id === convertingQuotation.clientId)?.companyName}</p></div>
                <button onClick={() => setConvertingQuotation(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-900" /></button>
              </div>
              <form onSubmit={handleConvertToContractSubmit} className="p-6 space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">From Quotation</p>
                  {convertingQuotation.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm"><span className="text-slate-900">{item.description}</span><span className="font-bold">${item.amount.toLocaleString()}</span></div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 mt-2"><span>Total</span><span>${convertingQuotation.total.toLocaleString()}</span></div>
                </div>
                <MinimalSelect label="Billboard" value={convertForm.billboardId} onChange={(e: any) => setConvertForm({...convertForm, billboardId: e.target.value})} options={[{value: '', label: 'Select Billboard...'}, ...getBillboards().map(b => ({value: b.id, label: `${b.name} (${b.town})`}))]} />
                <div className="grid grid-cols-2 gap-4">
                  <MinimalInput label="Start Date" type="date" value={convertForm.startDate} onChange={(e: any) => setConvertForm({...convertForm, startDate: e.target.value})} required />
                  <MinimalInput label="End Date" type="date" value={convertForm.endDate} onChange={(e: any) => setConvertForm({...convertForm, endDate: e.target.value})} required />
                </div>
                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl"><FileText size={18} /> Create Contract & Preserve Quotation</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {sendModal && (() => {
        const { doc, client } = sendModal;
        const { subject, message } = buildDocSendDefaults(doc);
        return (
          <SendDocumentModal
            isOpen={true}
            onClose={() => setSendModal(null)}
            documentType="quotation"
            documentId={doc.id}
            documentLabel={`Quotation #${doc.quoteNumber || doc.id}`}
            clientName={client.companyName}
            clientEmail={client.email}
            defaultSubject={subject}
            defaultMessage={message}
            onSent={({ to }) => { markQuotationSent(doc.id, to); setInvoices(getInvoices()); alert(`Quotation sent to ${to}`); }}
          />
        );
      })()}
    </div>
  );
};

export default Quotations;
