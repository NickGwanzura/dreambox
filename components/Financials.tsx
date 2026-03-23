
import React, { useState, useEffect } from 'react';
import { getInvoices, getContracts, getClients, getBillboards, addInvoice, markInvoiceAsPaid, deleteInvoice, addContract, getCompanyProfile, getCompanyLogo, subscribe } from '../services/mockData';
import { generateInvoicePDF, generateStatementPDF } from '../services/pdfGenerator';
import { Download, Plus, X, Save, Link2, CreditCard, Search, Trash2, FileText, Building2, Phone, Mail, Globe } from 'lucide-react';
import { Invoice, Contract, BillboardType, VAT_RATE } from '../types';

type InvoiceLineItem = Invoice['items'][number];

const MinimalInput = ({ label, value, onChange, type = "text", required = false, disabled = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} disabled={disabled} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:text-slate-400 disabled:cursor-not-allowed" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalTextarea = ({ label, value, onChange, rows = 3, required = false, disabled = false }: any) => (
  <div className="group relative">
    <textarea rows={rows} required={required} disabled={disabled} value={value} onChange={onChange} placeholder=" " className="peer w-full resize-none px-0 py-3 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:text-slate-400 disabled:cursor-not-allowed" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-3 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalSelect = ({ label, value, onChange, options, disabled = false }: any) => (
  <div className="group relative">
    <select value={value} disabled={disabled} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

interface FinancialsProps { initialTab?: 'Invoices' | 'Quotations' | 'Receipts' | 'Statements'; }

export const Financials: React.FC<FinancialsProps> = ({ initialTab = 'Invoices' }) => {
  const [activeTab, setActiveTab] = useState<'Invoices' | 'Quotations' | 'Receipts' | 'Statements'>(initialTab);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>(getInvoices());
  const [allClients, setAllClients] = useState(getClients());
  const [searchTerm, setSearchTerm] = useState('');
  const [newItem, setNewItem] = useState({ description: '', amount: 0 });
  const [formData, setFormData] = useState<Partial<Invoice>>({ clientId: '', items: [], date: new Date().toISOString().split('T')[0], status: 'Pending', contractId: '', paymentMethod: 'Bank Transfer', paymentReference: '' });
  const [selectedInvoiceToPay, setSelectedInvoiceToPay] = useState('');
  const [hasVat, setHasVat] = useState(true);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountDescription, setDiscountDescription] = useState('');
  const [convertingQuotation, setConvertingQuotation] = useState<Invoice | null>(null);
  const [convertForm, setConvertForm] = useState({ billboardId: '', startDate: '', endDate: '' });

  const getEmptyFormData = (): Partial<Invoice> => ({
    clientId: '',
    items: [],
    date: new Date().toISOString().split('T')[0],
    status: 'Pending',
    contractId: '',
    paymentMethod: 'Bank Transfer',
    paymentReference: ''
  });

  // Refresh data whenever tab changes, modal closes, or a data sync happens
  useEffect(() => {
    setInvoices(getInvoices());
    setAllClients(getClients());
  }, [activeTab, isModalOpen]);

  // Subscribe to live data changes (Supabase sync)
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setInvoices(getInvoices());
      setAllClients(getClients());
    });
    return () => unsubscribe();
  }, []);

  const handleRentalSelect = (contractId: string) => {
      const contract = getContracts().find(c => c.id === contractId);
      if (contract) {
          const billboard = getBillboards().find(b => b.id === contract.billboardId);
          setFormData({ ...formData, contractId: contractId, clientId: contract.clientId, items: [{ description: `Monthly Rental - ${billboard?.name} (${contract.details})`, amount: contract.monthlyRate }] });
      }
  };
  const handleInvoiceSelect = (invoiceId: string) => {
      setSelectedInvoiceToPay(invoiceId);
      const invoice = getInvoices().find(i => i.id === invoiceId);
      if (invoice) { setFormData({ ...formData, clientId: invoice.clientId, contractId: invoice.contractId, items: [{ description: `Payment for Invoice #${invoice.id}`, amount: invoice.total }] }); setHasVat(false); setDiscountType('amount'); setDiscountValue(0); setDiscountDescription(''); }
  };
  const addItem = () => {
      const trimmedDescription = newItem.description.trim();
      if(trimmedDescription && newItem.amount > 0) {
          setFormData({ ...formData, items: [...(formData.items || []), { description: trimmedDescription, amount: newItem.amount }] });
          setNewItem({ description: '', amount: 0 });
      }
  };
  const updateItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
      const updatedItems = [...(formData.items || [])];
      updatedItems[index] = {
          ...updatedItems[index],
          [field]: field === 'amount' ? Number(value) || 0 : String(value),
      };
      setFormData({ ...formData, items: updatedItems });
  };
  const removeItem = (index: number) => {
      setFormData({ ...formData, items: (formData.items || []).filter((_, itemIndex) => itemIndex !== index) });
  };
  const subtotal = formData.items?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const rawDiscountAmount = discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
  const discountAmount = Math.min(subtotal, Math.max(0, rawDiscountAmount || 0));
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const vatAmount = hasVat ? taxableSubtotal * VAT_RATE : 0;
  const total = taxableSubtotal + vatAmount;
  const receiptIsLinkedToInvoice = activeTab === 'Receipts' && !!selectedInvoiceToPay;
  const handleCreate = (e: React.FormEvent) => {
      e.preventDefault();
      const newDoc: Invoice = { id: `${activeTab === 'Quotations' ? 'QT' : activeTab === 'Receipts' ? 'RCT' : 'INV'}-${Date.now().toString().slice(-4)}`, clientId: formData.clientId!, date: formData.date!, items: formData.items || [], subtotal, discountAmount, discountDescription: discountAmount > 0 ? discountDescription.trim() || undefined : undefined, vatAmount, total, status: activeTab === 'Receipts' ? 'Paid' : 'Pending', type: activeTab === 'Invoices' ? 'Invoice' : activeTab === 'Quotations' ? 'Quotation' : 'Receipt', contractId: formData.contractId, paymentMethod: activeTab === 'Receipts' ? formData.paymentMethod : undefined, paymentReference: activeTab === 'Receipts' ? formData.paymentReference : undefined };
      addInvoice(newDoc);
      if (activeTab === 'Receipts' && selectedInvoiceToPay) { markInvoiceAsPaid(selectedInvoiceToPay); }
      setInvoices(getInvoices()); setIsModalOpen(false); setFormData(getEmptyFormData()); setSelectedInvoiceToPay(''); setHasVat(true); setDiscountType('amount'); setDiscountValue(0); setDiscountDescription(''); setNewItem({ description: '', amount: 0 }); alert(`${activeTab.slice(0, -1)} Created Successfully!`);
  };
  const downloadPDF = (doc: Invoice) => { const client = allClients.find(c => c.id === doc.clientId); if (client) { generateInvoicePDF(doc, client); } else { alert(`Could not generate PDF: Client data missing for ID ${doc.clientId}`); } };
  const initiatePayment = (invoice: Invoice) => { setActiveTab('Receipts'); setIsModalOpen(true); setTimeout(() => handleInvoiceSelect(invoice.id), 0); };

  const handleDelete = (doc: Invoice) => {
      if(window.confirm(`Are you sure you want to delete ${doc.type} #${doc.id}? This action cannot be undone.`)) {
          deleteInvoice(doc.id);
          setInvoices(getInvoices());
      }
  };

  const handleConvertToContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingQuotation || !convertForm.billboardId || !convertForm.startDate || !convertForm.endDate) return;
    const bb = getBillboards().find(b => b.id === convertForm.billboardId);
    const monthlyRate = convertingQuotation.items[0]?.amount || 0;
    const months = Math.max(1, Math.ceil((new Date(convertForm.endDate).getTime() - new Date(convertForm.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const subtotal = monthlyRate * months;
    const vatAmount = convertingQuotation.vatAmount > 0 ? subtotal * VAT_RATE : 0;
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
      totalContractValue: subtotal + vatAmount,
      status: 'Active',
      details: bb?.type === BillboardType.LED ? 'Slot 1' : 'Side A',
      createdAt: new Date().toISOString(),
    };
    addContract(contract);
    deleteInvoice(convertingQuotation.id);
    setInvoices(getInvoices());
    setConvertingQuotation(null);
    setConvertForm({ billboardId: '', startDate: '', endDate: '' });
    alert(`Contract ${contract.id} created from Quotation #${convertingQuotation.id}`);
  };

  const filteredDocs = invoices.filter(i => {
      const iType = String(i.type || '').toLowerCase();
      let matchesType = false;
      if (activeTab === 'Invoices') matchesType = iType === 'invoice'; else if (activeTab === 'Quotations') matchesType = iType === 'quotation'; else if (activeTab === 'Receipts') matchesType = iType === 'receipt';
      const searchLower = searchTerm.toLowerCase();
      const clientName = allClients.find(c => c.id === i.clientId)?.companyName.toLowerCase() || '';
      const matchesSearch = i.id.toLowerCase().includes(searchLower) || clientName.includes(searchLower) || (i.paymentReference && i.paymentReference.toLowerCase().includes(searchLower));
      return matchesType && matchesSearch;
  });

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">{activeTab === 'Receipts' ? 'Receipts & Payments' : activeTab === 'Statements' ? 'Client Statements' : 'Financial Documents'}</h2><p className="text-slate-500 font-medium">{activeTab === 'Statements' ? 'Account balances, outstanding amounts, and statement PDFs per client' : 'Create invoices, manage VAT, and track payment history'}</p></div>
          {activeTab !== 'Statements' && (<div className="flex gap-4 w-full sm:w-auto justify-end"><div className="relative group w-full sm:w-64 hidden sm:block"><Search className="absolute left-3 top-3 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search ID, Client, Ref..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-full bg-white outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all text-sm"/></div><button onClick={() => { setSelectedInvoiceToPay(''); setFormData(getEmptyFormData()); setNewItem({ description: '', amount: 0 }); setHasVat(true); setDiscountType('amount'); setDiscountValue(0); setDiscountDescription(''); setIsModalOpen(true); }} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg transition-all hover:scale-105"><Plus size={16} /> <span className="hidden sm:inline">New {activeTab.slice(0, -1)}</span><span className="sm:hidden">New</span></button></div>)}
        </div>

        {/* Mobile-friendly tabs */}
        <div className="border-b border-slate-200 overflow-x-auto no-scrollbar"><div className="flex gap-8 min-w-max">{(['Invoices', 'Quotations', 'Receipts', 'Statements'] as const).map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>{tab}{activeTab === tab && (<div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900" />)}</button>))}</div></div>

        {activeTab === 'Statements' && (() => {
          const company = getCompanyProfile();
          const logo = getCompanyLogo();
          // Use React state (invoices) so re-renders trigger on subscribe updates
          // Normalize total to number and type to lowercase for Supabase compatibility
          const inv = (inv: any) => Number(inv.total) || Number(inv.subtotal) || 0;
          const isInvoiceType = (i: any) => String(i.type || '').toLowerCase() === 'invoice';
          const isReceiptType = (i: any) => String(i.type || '').toLowerCase() === 'receipt';
          const isOverdueStatus = (i: any) => String(i.status || '').toLowerCase() === 'overdue';
          // clientId might come back as client_id from Supabase depending on schema
          const getClientId = (i: any) => i.clientId || i.client_id || '';

          const allContracts = getContracts();
          const allBillboards = getBillboards();
          const getBillboardName = (id: string) => allBillboards.find(b => b.id === id)?.name || id;

          // Portfolio totals from React invoices state
          const grandBilled = invoices.filter(isInvoiceType).reduce((a, i) => a + inv(i), 0);
          const grandPaid = invoices.filter(isReceiptType).reduce((a, i) => a + inv(i), 0);
          const grandOutstanding = grandBilled - grandPaid;

          return (
            <div className="space-y-6 animate-fade-in">
              {/* Company letterhead banner */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 flex items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-4">
                  {logo && logo.startsWith('data:image') ? (
                    <img src={logo} alt="Logo" className="w-14 h-14 rounded-xl object-cover border-2 border-white/20 shadow-md bg-white/10" />
                  ) : (
                    <div className="w-14 h-14 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-md border-2 border-white/20">
                      {company.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-white font-black text-xl tracking-tight">{company.name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{company.address}, {company.city} &bull; {company.country}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      {company.phone && <span className="flex items-center gap-1 text-slate-400 text-[10px]"><Phone size={10}/> {company.phone}</span>}
                      {company.email && <span className="flex items-center gap-1 text-slate-400 text-[10px]"><Mail size={10}/> {company.email}</span>}
                      {company.vatNumber && <span className="flex items-center gap-1 text-slate-400 text-[10px]"><Building2 size={10}/> VAT: {company.vatNumber}</span>}
                      {company.website && <span className="flex items-center gap-1 text-slate-400 text-[10px]"><Globe size={10}/> {company.website}</span>}
                    </div>
                  </div>
                </div>
                {/* Portfolio totals */}
                <div className="hidden sm:flex gap-4 shrink-0">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Billed</p>
                    <p className="text-lg font-black text-white">${grandBilled.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Collected</p>
                    <p className="text-lg font-black text-emerald-400">${grandPaid.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Outstanding</p>
                    <p className={`text-lg font-black ${grandOutstanding > 0 ? 'text-red-400' : 'text-emerald-400'}`}>${grandOutstanding.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Per-client statement cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {allClients.map(client => {
                  const clientInvoices = invoices.filter(i => getClientId(i) === client.id);
                  const totalBilled = clientInvoices.filter(isInvoiceType).reduce((acc, i) => acc + inv(i), 0);
                  const totalPaid = clientInvoices.filter(isReceiptType).reduce((acc, i) => acc + inv(i), 0);
                  const outstanding = totalBilled - totalPaid;
                  const activeContracts = allContracts.filter(c => (c.clientId || (c as any).client_id) === client.id && c.status === 'Active');
                  const overdueCount = clientInvoices.filter(isOverdueStatus).length;
                  return (
                    <div key={client.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-6 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-lg leading-tight">{client.companyName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{client.contactPerson} &bull; {client.email}</p>
                        </div>
                        {overdueCount > 0 && (
                          <span className="shrink-0 px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider rounded-lg animate-pulse">{overdueCount} Overdue</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billed</p><p className="text-base font-bold text-slate-800">${totalBilled.toLocaleString()}</p></div>
                        <div className="bg-green-50 rounded-xl p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-green-500 mb-1">Paid</p><p className="text-base font-bold text-green-700">${totalPaid.toLocaleString()}</p></div>
                        <div className={`rounded-xl p-3 ${outstanding > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}><p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${outstanding > 0 ? 'text-red-400' : 'text-emerald-500'}`}>Balance</p><p className={`text-base font-bold ${outstanding > 0 ? 'text-red-600' : 'text-emerald-700'}`}>${outstanding.toLocaleString()}</p></div>
                      </div>
                      {activeContracts.length > 0 && <p className="text-xs text-indigo-500 font-medium">{activeContracts.length} active rental{activeContracts.length > 1 ? 's' : ''}</p>}
                      <button onClick={() => generateStatementPDF(client, clientInvoices, activeContracts, getBillboardName)} className="mt-auto w-full py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 transition-all"><FileText size={14} /> Generate Statement PDF</button>
                    </div>
                  );
                })}
                {allClients.length === 0 && (
                  <div className="col-span-3 py-16 text-center text-slate-400 italic">No clients found. Data may still be loading from cloud.</div>
                )}
              </div>
            </div>
          );
        })()}

        {activeTab !== 'Statements' && <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 min-w-[600px] lg:min-w-[800px]">
              <thead className="bg-slate-50/50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">ID</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client / Info</th>{activeTab === 'Receipts' && (<><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Method</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Ref #</th></>)}<th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Total</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Status</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.length > 0 ? filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-bold text-slate-900">{doc.id}</td><td className="px-6 py-4">{doc.date}</td><td className="px-6 py-4"><div className="flex flex-col"><span className="text-xs font-bold text-slate-700">{allClients.find(c => c.id === doc.clientId)?.companyName || 'Unknown Client'}</span>{doc.contractId && <span className="text-[10px] text-indigo-500 font-medium flex items-center gap-1"><Link2 size={10}/> Contract {doc.contractId}</span>}</div></td>{activeTab === 'Receipts' && (<><td className="px-6 py-4 text-xs">{doc.paymentMethod || '-'}</td><td className="px-6 py-4 text-xs font-mono">{doc.paymentReference || '-'}</td></>)}<td className="px-6 py-4 text-right font-bold text-slate-900">${doc.total.toLocaleString()}</td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${doc.status === 'Paid' ? 'bg-green-100 text-green-700' : doc.status === 'Overdue' ? 'bg-red-100 text-red-700 animate-pulse' : doc.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{doc.status}</span></td><td className="px-6 py-4 flex justify-center gap-2"><button onClick={() => downloadPDF(doc)} className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-200 rounded-lg transition-colors" title="Download PDF"><Download size={16} /></button>{activeTab === 'Invoices' && doc.status === 'Pending' && (<button onClick={() => initiatePayment(doc)} className="p-2 text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 rounded-lg transition-colors" title="Record Payment"><CreditCard size={16} /></button>)}{activeTab === 'Quotations' && (<button onClick={() => { setConvertingQuotation(doc); setConvertForm({ billboardId: '', startDate: '', endDate: '' }); }} className="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors" title="Convert to Contract"><FileText size={16} /></button>)}<button onClick={() => handleDelete(doc)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={16} /></button></td></tr>
                )) : (<tr><td colSpan={activeTab === 'Receipts' ? 8 : 6} className="px-6 py-12 text-center text-slate-400 italic">No documents found.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl border border-white/20 max-h-[90vh] overflow-y-auto">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Create New {activeTab.slice(0, -1)}</h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleCreate} className="p-8 space-y-6">
                        {activeTab === 'Receipts' && (<div className="p-4 bg-green-50 rounded-xl border border-green-100 mb-2"><MinimalSelect label="Link to Pending Invoice" value={selectedInvoiceToPay} onChange={(e: any) => handleInvoiceSelect(e.target.value)} options={[{value: '', label: 'Select Invoice to Pay...'}, ...getInvoices().filter(i => i.status === 'Pending' && i.type === 'Invoice').map(i => ({ value: i.id, label: `Inv #${i.id} - $${i.total} (${allClients.find(c => c.id === i.clientId)?.companyName})`}))]}/></div>)}
                        {activeTab !== 'Receipts' && (<div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 mb-2"><MinimalSelect label="Link to Active Rental (Optional)" value={formData.contractId} onChange={(e: any) => handleRentalSelect(e.target.value)} options={[{value: '', label: 'Select Rental to Auto-fill...'}, ...getContracts().map(c => { const cl = allClients.find(x => x.id === c.clientId); const billboard = getBillboards().find(b => b.id === c.billboardId); return {value: c.id, label: `${cl?.companyName} - ${billboard?.name} (${c.details})`};})]}/></div>)}
                        <div className="grid grid-cols-2 gap-6"><MinimalSelect label="Client" value={formData.clientId} onChange={(e: any) => setFormData({...formData, clientId: e.target.value})} options={[{value: '', label: 'Select Client...'}, ...allClients.map(c => ({value: c.id, label: c.companyName}))]}/><MinimalInput label="Date" type="date" value={formData.date} onChange={(e: any) => setFormData({...formData, date: e.target.value})} /></div>
                        {activeTab === 'Receipts' && (<div className="grid grid-cols-2 gap-6"><MinimalSelect label="Payment Method" value={formData.paymentMethod} onChange={(e: any) => setFormData({...formData, paymentMethod: e.target.value})} options={[{value: 'Bank Transfer', label: 'Bank Transfer'},{value: 'Cash', label: 'Cash'},{value: 'EcoCash', label: 'EcoCash'},{value: 'Other', label: 'Other'}]}/><MinimalInput label="Reference Number" value={formData.paymentReference} onChange={(e: any) => setFormData({...formData, paymentReference: e.target.value})} /></div>)}
                        <div className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Line Items</h4>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end">
                                <div className="flex-1"><MinimalTextarea label="Description / Details" value={newItem.description} onChange={(e: any) => setNewItem({...newItem, description: e.target.value})} rows={3} /></div>
                                <div><MinimalInput label="Amount ($)" type="number" value={newItem.amount} onChange={(e: any) => setNewItem({...newItem, amount: Number(e.target.value)})} /></div>
                                <button type="button" onClick={addItem} className="bg-slate-900 text-white rounded-xl px-4 py-3 hover:bg-slate-800 flex items-center justify-center gap-2"><Plus size={18}/> Add</button>
                            </div>
                            {formData.items && formData.items.length > 0 && (
                              <div className="mt-4 space-y-3">
                                {formData.items.map((item, idx) => (
                                  <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Line Item {idx + 1}</span>
                                      <button type="button" onClick={() => removeItem(idx)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove line item">
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                    <MinimalTextarea label="Description / Details" value={item.description} onChange={(e: any) => updateItem(idx, 'description', e.target.value)} rows={3} />
                                    <div className="w-full md:w-40">
                                      <MinimalInput label="Amount ($)" type="number" value={item.amount} onChange={(e: any) => updateItem(idx, 'amount', e.target.value)} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Discount</h4>
                                {receiptIsLinkedToInvoice && <span className="text-[11px] font-medium text-slate-400">Locked for linked invoice receipts</span>}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[180px_140px] gap-4">
                                <MinimalSelect label="Discount Type" value={discountType} disabled={receiptIsLinkedToInvoice} onChange={(e: any) => setDiscountType(e.target.value)} options={[{ value: 'amount', label: 'Fixed Amount' }, { value: 'percentage', label: 'Percentage %' }]} />
                                <MinimalInput label={discountType === 'percentage' ? 'Discount %' : 'Discount Amount ($)'} type="number" disabled={receiptIsLinkedToInvoice} value={discountValue} onChange={(e: any) => setDiscountValue(Number(e.target.value))} />
                            </div>
                            <MinimalInput label="Discount Note (Optional)" disabled={receiptIsLinkedToInvoice} value={discountDescription} onChange={(e: any) => setDiscountDescription(e.target.value)} />
                            {receiptIsLinkedToInvoice && <p className="text-xs text-slate-400">To keep balances correct, linked receipts use the invoice amount exactly.</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={hasVat} disabled={activeTab === 'Receipts' && !!selectedInvoiceToPay} onChange={e => setHasVat(e.target.checked)} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                            <label className="text-sm font-medium text-slate-600">Include VAT (15%)</label>
                        </div>
                        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-2">
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
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Save size={18} /> Create {activeTab.slice(0, -1)}</button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {convertingQuotation && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setConvertingQuotation(null)} />
          <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div><h3 className="text-xl font-bold text-slate-900">Convert Quotation to Contract</h3><p className="text-xs text-slate-400 mt-0.5">QT #{convertingQuotation.id} — {allClients.find(c => c.id === convertingQuotation.clientId)?.companyName}</p></div>
                <button onClick={() => setConvertingQuotation(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-400" /></button>
              </div>
              <form onSubmit={handleConvertToContract} className="p-8 space-y-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">From Quotation</p>
                  {convertingQuotation.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm"><span className="text-slate-600">{item.description}</span><span className="font-bold">${item.amount.toLocaleString()}</span></div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 mt-2"><span>Total</span><span>${convertingQuotation.total.toLocaleString()}</span></div>
                </div>
                <MinimalSelect label="Billboard" value={convertForm.billboardId} onChange={(e: any) => setConvertForm({...convertForm, billboardId: e.target.value})} options={[{value: '', label: 'Select Billboard...'}, ...getBillboards().map(b => ({value: b.id, label: `${b.name} (${b.town})`}))]} />
                <div className="grid grid-cols-2 gap-6">
                  <MinimalInput label="Start Date" type="date" value={convertForm.startDate} onChange={(e: any) => setConvertForm({...convertForm, startDate: e.target.value})} required />
                  <MinimalInput label="End Date" type="date" value={convertForm.endDate} onChange={(e: any) => setConvertForm({...convertForm, endDate: e.target.value})} required />
                </div>
                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl"><FileText size={18} /> Create Contract & Archive Quotation</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
