import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, FileText, CreditCard, Receipt, Plus, Trash2, Zap, ChevronDown, Download, Loader, TrendingDown, UserPlus, ArrowLeft, Monitor } from 'lucide-react';
import { addInvoice, addExpense, addClient, getClients, getBillboards } from '../services/mockData';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { getCurrentUser } from '../services/authServiceSecure';
import { getEffectiveVatRate } from '../services/mockData';
import type { Invoice, Client, Expense, Billboard } from '../types';
import { BillboardType } from '../types';

type ClientMode = 'list' | 'create';

type DocType = 'Quotation' | 'Invoice' | 'Receipt' | 'Expense';

const EXPENSE_CATEGORIES = ['Maintenance', 'Printing', 'Electricity', 'Labor', 'Other'] as const;

const getLocalDateInputValue = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface LineItem {
  description: string;
  amount: number;
}

const PRESETS: { label: string; description: string }[] = [
  { label: 'Billboard Rental', description: 'Billboard Rental — Monthly' },
  { label: 'Printing', description: 'Printing & Production' },
  { label: 'Installation', description: 'Site Installation & Setup' },
  { label: 'Design Fee', description: 'Creative Design Fee' },
  { label: 'LED Slot', description: 'LED Screen Slot — Monthly' },
  { label: 'Activation Fee', description: 'Campaign Activation Fee' },
];

interface QuickCreateProps {
  open: boolean;
  initialType?: DocType;
  onClose: () => void;
}

export const QuickCreate: React.FC<QuickCreateProps> = ({ open, initialType = 'Quotation', onClose }) => {
  const [docType, setDocType] = useState<DocType>(initialType);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientList, setShowClientList] = useState(false);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [items, setItems] = useState<LineItem[]>([{ description: '', amount: 0 }]);
  const [hasVat, setHasVat] = useState(true);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(getLocalDateInputValue());
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return getLocalDateInputValue(d);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Expense-specific state
  const [expenseCategory, setExpenseCategory] = useState<typeof EXPENSE_CATEGORIES[number]>('Other');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseReference, setExpenseReference] = useState('');
  // Billboard catalog
  const [allBillboards, setAllBillboards] = useState<Billboard[]>([]);
  const [billboardSearch, setBillboardSearch] = useState('');
  const [showBillboardCatalog, setShowBillboardCatalog] = useState(false);
  // New client inline form
  const [clientMode, setClientMode] = useState<ClientMode>('list');
  const [newClientName, setNewClientName] = useState('');
  const [newClientContact, setNewClientContact] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const currentUser = getCurrentUser();

  useEffect(() => {
    setAllClients(getClients());
    setAllBillboards(getBillboards());
  }, [open]);

  useEffect(() => {
    if (open) {
      setDocType(initialType);
      setError(null);
      setClientMode('list');
      setShowClientList(false);
    }
  }, [open, initialType]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filteredClients = allClients.filter(c =>
    c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.contactPerson.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleCreateClient = async () => {
    if (!newClientName.trim() || !newClientContact.trim() || !newClientPhone.trim()) return;
    setCreatingClient(true);
    try {
      const newClient: Client = {
        id: `CL-${Date.now()}`,
        companyName: newClientName.trim(),
        contactPerson: newClientContact.trim(),
        phone: newClientPhone.trim(),
        email: newClientEmail.trim() || undefined,
        status: 'Active',
      };
      await addClient(newClient);
      const refreshed = getClients();
      setAllClients(refreshed);
      const created = refreshed.find(c => c.companyName === newClient.companyName && c.contactPerson === newClient.contactPerson) || newClient;
      setSelectedClient(created);
      setShowClientList(false);
      setClientMode('list');
      setNewClientName(''); setNewClientContact(''); setNewClientPhone(''); setNewClientEmail('');
    } finally {
      setCreatingClient(false);
    }
  };

  const gross = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const vatRate = getEffectiveVatRate();
  const afterDiscount = Math.max(0, gross - (Number(discountAmount) || 0));
  const total = afterDiscount;
  const subtotal = hasVat ? afterDiscount / (1 + vatRate) : afterDiscount;
  const vatAmount = hasVat ? total - subtotal : 0;

  const addItem = () => setItems(prev => [...prev, { description: '', amount: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };
  const addPreset = (preset: typeof PRESETS[number]) => {
    setItems(prev => {
      const empty = prev.findIndex(i => !i.description && !i.amount);
      if (empty >= 0) {
        return prev.map((item, idx) => idx === empty ? { ...item, description: preset.description } : item);
      }
      return [...prev, { description: preset.description, amount: 0 }];
    });
  };

  const handleSave = useCallback(async (asDraft = false) => {
    setError(null);
    setSaving(true);
    try {
      if (docType === 'Expense') {
        if (!expenseDescription.trim()) { setError('Description is required'); setSaving(false); return; }
        if (!expenseAmount || expenseAmount <= 0) { setError('Enter a valid amount'); setSaving(false); return; }
        await addExpense({
          id: '',
          category: expenseCategory,
          description: expenseDescription.trim(),
          amount: expenseAmount,
          date,
          reference: expenseReference.trim() || undefined,
        } as Expense);
        onClose();
        setExpenseDescription('');
        setExpenseAmount(0);
        setExpenseReference('');
        return;
      }

      if (!selectedClient) { setError('Select a client first'); setSaving(false); return; }
      const validItems = items.filter(i => i.description.trim());
      if (!validItems.length) { setError('Add at least one line item'); setSaving(false); return; }

      const payload: Omit<Invoice, 'id'> = {
        clientId: selectedClient.id,
        date,
        items: validItems.map(i => ({
          description: i.description,
          quantity: 1,
          unitPrice: Number(i.amount) || 0,
          amount: Number(i.amount) || 0,
        })),
        subtotal,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        vatAmount,
        total,
        hasVat,
        type: docType,
        status: 'Pending',
        notes: notes || undefined,
        ...(docType === 'Quotation' && {
          quoteStatus: 'Draft',
          expiryDate,
          createdBy: currentUser?.email,
        }),
      } as any;

      const created = await addInvoice(payload as Invoice);

      // Auto-download PDF
      try {
        await generateInvoicePDF(created, selectedClient);
      } catch (pdfErr) {
        console.warn('PDF generation failed after save:', pdfErr);
      }

      onClose();
      setSelectedClient(null);
      setClientSearch('');
      setItems([{ description: '', amount: 0 }]);
      setDiscountAmount(0);
      setNotes('');
    } catch (err: any) {
      setError(err?.message || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [docType, expenseCategory, expenseDescription, expenseAmount, expenseReference, selectedClient, items, date, expiryDate, subtotal, discountAmount, vatAmount, total, hasVat, notes, currentUser, onClose]);

  if (!open) return null;

  const typeConfig: Record<DocType, { icon: any; label: string }> = {
    Quotation: { icon: FileText,     label: 'Quote'   },
    Invoice:   { icon: CreditCard,   label: 'Invoice' },
    Receipt:   { icon: Receipt,      label: 'Receipt' },
    Expense:   { icon: TrendingDown, label: 'Expense' },
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 bottom-0 z-[201] w-full max-w-lg bg-white shadow-2xl flex flex-col animate-slide-in-right overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-create-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <Zap size={16} className="text-indigo-300" />
            </div>
            <div>
              <h2 id="quick-create-title" className="text-base font-bold text-white">Quick Create</h2>
              <p className="text-xs text-slate-200">PDF auto-downloads on save</p>
            </div>
          </div>
          <button aria-label="Close quick create" onClick={onClose} className="p-2 text-slate-200 hover:text-white hover:bg-white/10 rounded-2xl transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Type Selector */}
        <div className="flex gap-1.5 px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50">
          {(['Quotation', 'Invoice', 'Expense'] as DocType[]).map(t => {
            const cfg = typeConfig[t];
            const Icon = cfg.icon;
            const active = docType === t;
            return (
              <button
                key={t}
                onClick={() => setDocType(t)}
                aria-pressed={active}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold transition-all border ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon size={13} />
                {t}
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Expense Form */}
          {docType === 'Expense' && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category *</label>
                <select
                  value={expenseCategory}
                  onChange={e => setExpenseCategory(e.target.value as typeof EXPENSE_CATEGORIES[number])}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                >
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description *</label>
                <input
                  type="text"
                  placeholder="What was the expense for?"
                  value={expenseDescription}
                  onChange={e => setExpenseDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-sm font-medium">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={expenseAmount || ''}
                      onChange={e => setExpenseAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reference (optional)</label>
                <input
                  type="text"
                  placeholder="Receipt #, invoice ref..."
                  value={expenseReference}
                  onChange={e => setExpenseReference(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                />
              </div>
            </>
          )}

          {/* Invoice / Quote / Receipt fields */}
          {docType !== 'Expense' && (
            <>
              {/* Client */}
              <div className="relative">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Client *</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowClientList(v => !v)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium text-left transition-colors ${
                      selectedClient ? 'border-slate-900 text-slate-900 bg-slate-50' : 'border-slate-200 text-slate-700 bg-white hover:border-slate-300'
                    }`}
                    aria-label="Select client"
                    aria-expanded={showClientList}
                  >
                    <span className="truncate">{selectedClient ? `${selectedClient.companyName} — ${selectedClient.contactPerson}` : 'Select client...'}</span>
                    <ChevronDown size={14} className="text-slate-600 shrink-0 ml-2" />
                  </button>
                  {showClientList && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                      {clientMode === 'create' ? (
                        /* ── Inline new client form ── */
                        <div className="p-4 space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              type="button"
                              onClick={() => setClientMode('list')}
                              className="p-1 text-slate-600 hover:text-slate-900 rounded-xl transition-all"
                              aria-label="Back to client list"
                            >
                              <ArrowLeft size={14} />
                            </button>
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">New Client</span>
                          </div>
                          <input
                            autoFocus
                            type="text"
                            placeholder="Company name *"
                            value={newClientName}
                            onChange={e => setNewClientName(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                          />
                          <input
                            type="text"
                            placeholder="Contact person *"
                            value={newClientContact}
                            onChange={e => setNewClientContact(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="tel"
                              placeholder="Phone *"
                              value={newClientPhone}
                              onChange={e => setNewClientPhone(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                            />
                            <input
                              type="email"
                              placeholder="Email (optional)"
                              value={newClientEmail}
                              onChange={e => setNewClientEmail(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleCreateClient}
                            disabled={creatingClient || !newClientName.trim() || !newClientContact.trim() || !newClientPhone.trim()}
                            className="w-full py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-2xl transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
                          >
                            {creatingClient ? <Loader size={13} className="animate-spin" /> : <UserPlus size={13} />}
                            {creatingClient ? 'Creating...' : 'Create & Select'}
                          </button>
                        </div>
                      ) : (
                        /* ── Search & full scroll list ── */
                        <>
                          <div className="p-2 border-b border-slate-100">
                            <input
                              autoFocus
                              type="text"
                              placeholder={`Search ${allClients.length} client${allClients.length !== 1 ? 's' : ''}...`}
                              value={clientSearch}
                              onChange={e => setClientSearch(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                            />
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {filteredClients.length > 0 ? filteredClients.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => { setSelectedClient(c); setShowClientList(false); setClientSearch(''); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors"
                              >
                                <p className="text-sm font-semibold text-slate-900">{c.companyName}</p>
                                <p className="text-xs text-slate-500">{c.contactPerson}{c.phone ? ` · ${c.phone}` : ''}</p>
                              </button>
                            )) : (
                              <p className="text-xs text-slate-700 px-4 py-3 text-center">No clients match "{clientSearch}"</p>
                            )}
                          </div>
                          <div className="p-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setClientMode('create')}
                              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all hover:-translate-y-0.5"
                            >
                              <UserPlus size={13} /> New Client
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className={`grid gap-4 ${docType === 'Quotation' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                  />
                </div>
                {docType === 'Quotation' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Valid Until</label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Quick Add presets + Billboard Catalog toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Add</label>
                  <button
                    type="button"
                    onClick={() => { setShowBillboardCatalog(v => !v); setBillboardSearch(''); }}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full transition-colors border ${
                      showBillboardCatalog
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                    }`}
                  >
                    <Monitor size={11} /> Billboards
                  </button>
                </div>

                {showBillboardCatalog ? (
                  /* ── Billboard catalog ── */
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <input
                        autoFocus
                        type="text"
                        placeholder={`Search ${allBillboards.length} billboards...`}
                        value={billboardSearch}
                        onChange={e => setBillboardSearch(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 bg-white"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                      {allBillboards
                        .filter(b =>
                          b.name.toLowerCase().includes(billboardSearch.toLowerCase()) ||
                          b.town.toLowerCase().includes(billboardSearch.toLowerCase())
                        )
                        .map(b => {
                          const isLed = b.type === BillboardType.LED;
                          const rates: { label: string; amount: number; desc: string }[] = [];
                          if (isLed && b.ratePerSlot) {
                            rates.push({ label: 'LED Slot', amount: b.ratePerSlot, desc: `${b.name} — LED Slot (${b.town})` });
                          } else {
                            if (b.sideARate) rates.push({ label: 'Side A', amount: b.sideARate, desc: `${b.name} — Side A Billboard Rental (${b.town})` });
                            if (b.sideBRate) rates.push({ label: 'Side B', amount: b.sideBRate, desc: `${b.name} — Side B Billboard Rental (${b.town})` });
                            if (!b.sideARate && !b.sideBRate) rates.push({ label: 'Rental', amount: 0, desc: `${b.name} — Billboard Rental (${b.town})` });
                          }
                          return (
                            <div key={b.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-bold text-slate-900 flex-1 truncate">{b.name}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLed ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {isLed ? 'LED' : 'Static'}
                                </span>
                                <span className="text-[10px] text-slate-700">{b.town}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {rates.map(r => (
                                  <button
                                    key={r.label}
                                    type="button"
                                    onClick={() => setItems(prev => {
                                      const empty = prev.findIndex(i => !i.description && !i.amount);
                                      const newItem = { description: r.desc, amount: r.amount };
                                      return empty >= 0
                                        ? prev.map((item, idx) => idx === empty ? newItem : item)
                                        : [...prev, newItem];
                                    })}
                                    className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-full transition-colors border border-indigo-100"
                                  >
                                    + {r.label}{r.amount > 0 ? ` · $${r.amount.toLocaleString()}` : ''}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      {allBillboards.filter(b =>
                        b.name.toLowerCase().includes(billboardSearch.toLowerCase()) ||
                        b.town.toLowerCase().includes(billboardSearch.toLowerCase())
                      ).length === 0 && (
                        <p className="text-xs text-slate-700 px-4 py-4 text-center">No billboards match "{billboardSearch}"</p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── Text presets ── */
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => addPreset(p)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-full transition-colors border border-transparent hover:border-indigo-200"
                      >
                        + {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Line Items</label>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={e => updateItem(i, 'description', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                        />
                      </div>
                      <div className="w-28 shrink-0">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-sm font-medium">$</span>
                          <input
                            type="number"
                            placeholder="0"
                            min="0"
                            step="0.01"
                            value={item.amount || ''}
                            onChange={e => updateItem(i, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                          />
                        </div>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="p-2.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                          aria-label={`Remove line item ${i + 1}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors py-1"
                >
                  <Plus size={13} /> Add item
                </button>
              </div>

              {/* VAT + Discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Discount ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={discountAmount || ''}
                      onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 focus:border-indigo-400 focus:outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-end pb-0.5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">VAT ({(vatRate * 100).toFixed(0)}%)</label>
                  <button
                    type="button"
                    onClick={() => setHasVat(v => !v)}
                    aria-pressed={hasVat}
                    aria-label={`Amounts include VAT at ${(vatRate * 100).toFixed(0)} percent`}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasVat ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hasVat ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Payment terms, special conditions..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-900 font-medium focus:border-indigo-400 focus:outline-none resize-none bg-white"
                />
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Totals + Footer */}
        <div className="shrink-0 border-t border-slate-100 bg-white">
          {/* Totals — hidden for Expense */}
          {docType !== 'Expense' && (
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span className="font-medium text-slate-900">${gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>Discount</span>
                  <span>-${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {hasVat && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>VAT ({(vatRate * 100).toFixed(0)}%)</span>
                  <span className="font-medium text-slate-900">${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 text-base pt-1 border-t border-slate-200">
                <span>Total</span>
                <span>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-4 flex gap-3">
            {docType === 'Expense' ? (
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-2xl transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <TrendingDown size={14} />}
                {saving ? 'Saving...' : 'Save Expense'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="flex-1 py-3 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all hover:-translate-y-0.5 disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-2xl transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  {saving ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {saving ? 'Saving...' : 'Save & Download PDF'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
