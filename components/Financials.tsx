
import React, { useState, useEffect } from 'react';
import { getInvoices, getContracts, clients, getBillboards, addInvoice, markInvoiceAsPaid, deleteInvoice } from '../services/mockData';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { Download, Plus, X, Save, Link2, CreditCard, Search, Trash2 } from 'lucide-react';
import { Invoice, VAT_RATE } from '../types';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

interface FinancialsProps { initialTab?: 'Invoices' | 'Quotations' | 'Receipts'; }

export const Financials: React.FC<FinancialsProps> = ({ initialTab = 'Invoices' }) => {
  const [activeTab, setActiveTab] = useState<'Invoices' | 'Quotations' | 'Receipts'>(initialTab);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>(getInvoices());
  const [searchTerm, setSearchTerm] = useState('');
  const [newItem, setNewItem] = useState({ description: '', amount: 0 });
  const [formData, setFormData] = useState<Partial<Invoice>>({ clientId: '', items: [], date: new Date().toISOString().split('T')[0], status: 'Pending', contractId: '', paymentMethod: 'Bank Transfer', paymentReference: '' });
  const [selectedInvoiceToPay, setSelectedInvoiceToPay] = useState('');
  const [hasVat, setHasVat] = useState(true);

  useEffect(() => { setInvoices(getInvoices()); }, [activeTab, isModalOpen]);

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
      if (invoice) { setFormData({ ...formData, clientId: invoice.clientId, contractId: invoice.contractId, items: [{ description: `Payment for Invoice #${invoice.id}`, amount: invoice.total }] }); setHasVat(false); }
  };
  const addItem = () => { if(newItem.description && newItem.amount > 0) { setFormData({ ...formData, items: [...(formData.items || []), newItem] }); setNewItem({ description: '', amount: 0 }); } };
  const handleCreate = (e: React.FormEvent) => {
      e.preventDefault();
      const subtotal = formData.items?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
      const vatAmount = hasVat ? subtotal * VAT_RATE : 0;
      const total = subtotal + vatAmount;
      const newDoc: Invoice = { id: `${activeTab === 'Quotations' ? 'QT' : activeTab === 'Receipts' ? 'RCT' : 'INV'}-${Date.now().toString().slice(-4)}`, clientId: formData.clientId!, date: formData.date!, items: formData.items || [], subtotal, vatAmount, total, status: activeTab === 'Receipts' ? 'Paid' : 'Pending', type: activeTab === 'Invoices' ? 'Invoice' : activeTab === 'Quotations' ? 'Quotation' : 'Receipt', contractId: formData.contractId, paymentMethod: activeTab === 'Receipts' ? formData.paymentMethod : undefined, paymentReference: activeTab === 'Receipts' ? formData.paymentReference : undefined };
      addInvoice(newDoc);
      if (activeTab === 'Receipts' && selectedInvoiceToPay) { markInvoiceAsPaid(selectedInvoiceToPay); }
      setInvoices(getInvoices()); setIsModalOpen(false); setFormData({ clientId: '', items: [], date: new Date().toISOString().split('T')[0], status: 'Pending', contractId: '', paymentMethod: 'Bank Transfer', paymentReference: '' }); setSelectedInvoiceToPay(''); alert(`${activeTab.slice(0, -1)} Created Successfully!`);
  };
  const downloadPDF = (doc: Invoice) => { const client = clients.find(c => c.id === doc.clientId); if (client) { generateInvoicePDF(doc, client); } else { alert(`Could not generate PDF: Client data missing for ID ${doc.clientId}`); } };
  const initiatePayment = (invoice: Invoice) => { setActiveTab('Receipts'); setIsModalOpen(true); setTimeout(() => handleInvoiceSelect(invoice.id), 0); };

  const handleDelete = (doc: Invoice) => {
      if(window.confirm(`Are you sure you want to delete ${doc.type} #${doc.id}? This action cannot be undone.`)) {
          deleteInvoice(doc.id);
          setInvoices(getInvoices());
      }
  };

  const filteredDocs = invoices.filter(i => {
      let matchesType = false;
      if (activeTab === 'Invoices') matchesType = i.type === 'Invoice'; else if (activeTab === 'Quotations') matchesType = i.type === 'Quotation'; else if (activeTab === 'Receipts') matchesType = i.type === 'Receipt'; 
      const searchLower = searchTerm.toLowerCase();
      const clientName = clients.find(c => c.id === i.clientId)?.companyName.toLowerCase() || '';
      const matchesSearch = i.id.toLowerCase().includes(searchLower) || clientName.includes(searchLower) || (i.paymentReference && i.paymentReference.toLowerCase().includes(searchLower));
      return matchesType && matchesSearch;
  });

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">{activeTab === 'Receipts' ? 'Receipts & Payments' : 'Financial Documents'}</h2><p className="text-slate-500 font-medium">Create invoices, manage VAT, and track payment history</p></div>
          <div className="flex gap-4 w-full sm:w-auto justify-end"><div className="relative group w-full sm:w-64 hidden sm:block"><Search className="absolute left-3 top-3 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search ID, Client, Ref..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-full bg-white outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all text-sm"/></div><button onClick={() => { setSelectedInvoiceToPay(''); setFormData({ clientId: '', items: [], date: new Date().toISOString().split('T')[0], status: 'Pending', contractId: '', paymentMethod: 'Bank Transfer', paymentReference: '' }); setIsModalOpen(true); }} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg transition-all hover:scale-105"><Plus size={16} /> <span className="hidden sm:inline">New {activeTab.slice(0, -1)}</span><span className="sm:hidden">New</span></button></div>
        </div>
        
        {/* Mobile-friendly tabs */}
        <div className="border-b border-slate-200 overflow-x-auto no-scrollbar"><div className="flex gap-8 min-w-max">{(['Invoices', 'Quotations', 'Receipts'] as const).map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>{tab}{activeTab === tab && (<div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900" />)}</button>))}</div></div>
        
        <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
              <thead className="bg-slate-50/50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">ID</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client / Info</th>{activeTab === 'Receipts' && (<><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Method</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Ref #</th></>)}<th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Total</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Status</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.length > 0 ? filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-bold text-slate-900">{doc.id}</td><td className="px-6 py-4">{doc.date}</td><td className="px-6 py-4"><div className="flex flex-col"><span className="text-xs font-bold text-slate-700">{clients.find(c => c.id === doc.clientId)?.companyName || 'Unknown Client'}</span>{doc.contractId && <span className="text-[10px] text-indigo-500 font-medium flex items-center gap-1"><Link2 size={10}/> Contract {doc.contractId}</span>}</div></td>{activeTab === 'Receipts' && (<><td className="px-6 py-4 text-xs">{doc.paymentMethod || '-'}</td><td className="px-6 py-4 text-xs font-mono">{doc.paymentReference || '-'}</td></>)}<td className="px-6 py-4 text-right font-bold text-slate-900">${doc.total.toLocaleString()}</td><td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${doc.status === 'Paid' ? 'bg-green-100 text-green-700' : doc.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{doc.status}</span></td><td className="px-6 py-4 flex justify-center gap-2"><button onClick={() => downloadPDF(doc)} className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-200 rounded-lg transition-colors" title="Download PDF"><Download size={16} /></button>{activeTab === 'Invoices' && doc.status === 'Pending' && (<button onClick={() => initiatePayment(doc)} className="p-2 text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 rounded-lg transition-colors" title="Record Payment"><CreditCard size={16} /></button>)}<button onClick={() => handleDelete(doc)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={16} /></button></td></tr>
                )) : (<tr><td colSpan={activeTab === 'Receipts' ? 8 : 6} className="px-6 py-12 text-center text-slate-400 italic">No documents found.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
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
                        {activeTab === 'Receipts' && (<div className="p-4 bg-green-50 rounded-xl border border-green-100 mb-2"><MinimalSelect label="Link to Pending Invoice" value={selectedInvoiceToPay} onChange={(e: any) => handleInvoiceSelect(e.target.value)} options={[{value: '', label: 'Select Invoice to Pay...'}, ...getInvoices().filter(i => i.status === 'Pending' && i.type === 'Invoice').map(i => ({ value: i.id, label: `Inv #${i.id} - $${i.total} (${clients.find(c => c.id === i.clientId)?.companyName})`}))]}/></div>)}
                        {activeTab !== 'Receipts' && (<div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 mb-2"><MinimalSelect label="Link to Active Rental (Optional)" value={formData.contractId} onChange={(e: any) => handleRentalSelect(e.target.value)} options={[{value: '', label: 'Select Rental to Auto-fill...'}, ...getContracts().map(c => { const client = clients.find(cl => cl.id === c.clientId); const billboard = getBillboards().find(b => b.id === c.billboardId); return {value: c.id, label: `${client?.companyName} - ${billboard?.name} (${c.details})`};})]}/></div>)}
                        <div className="grid grid-cols-2 gap-6"><MinimalSelect label="Client" value={formData.clientId} onChange={(e: any) => setFormData({...formData, clientId: e.target.value})} options={[{value: '', label: 'Select Client...'}, ...clients.map(c => ({value: c.id, label: c.companyName}))]}/><MinimalInput label="Date" type="date" value={formData.date} onChange={(e: any) => setFormData({...formData, date: e.target.value})} /></div>
                        {activeTab === 'Receipts' && (<div className="grid grid-cols-2 gap-6"><MinimalSelect label="Payment Method" value={formData.paymentMethod} onChange={(e: any) => setFormData({...formData, paymentMethod: e.target.value})} options={[{value: 'Bank Transfer', label: 'Bank Transfer'},{value: 'Cash', label: 'Cash'},{value: 'EcoCash', label: 'EcoCash'},{value: 'Other', label: 'Other'}]}/><MinimalInput label="Reference Number" value={formData.paymentReference} onChange={(e: any) => setFormData({...formData, paymentReference: e.target.value})} /></div>)}
                        <div className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Line Items</h4>
                            <div className="flex gap-3">
                                <div className="flex-1"><MinimalInput label="Description" value={newItem.description} onChange={(e: any) => setNewItem({...newItem, description: e.target.value})} /></div>
                                <div className="w-32"><MinimalInput label="Amount ($)" type="number" value={newItem.amount} onChange={(e: any) => setNewItem({...newItem, amount: Number(e.target.value)})} /></div>
                                <button type="button" onClick={addItem} className="bg-slate-900 text-white rounded-xl px-4 mt-2 hover:bg-slate-800"><Plus size={18}/></button>
                            </div>
                            {formData.items && formData.items.length > 0 && (<div className="mt-4 space-y-2">{formData.items.map((item, idx) => (<div key={idx} className="flex justify-between text-sm bg-white p-3 rounded-lg border border-slate-200"><span>{item.description}</span><span className="font-bold">${item.amount}</span></div>))}</div>)}
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={hasVat} disabled={activeTab === 'Receipts' && !!selectedInvoiceToPay} onChange={e => setHasVat(e.target.checked)} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                            <label className="text-sm font-medium text-slate-600">Include VAT (15%)</label>
                        </div>
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Save size={18} /> Create {activeTab.slice(0, -1)}</button>
                    </form>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
