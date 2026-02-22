
import React, { useState, useEffect } from 'react';
import { getClients, getInvoices, getClientFinancials, getTransactions, getContracts, getBillboards, addInvoice, markInvoiceAsPaid, getUpcomingBillings, deleteInvoice } from '../services/mockData';
import { generateStatementPDF, generatePaymentSchedulePDF } from '../services/pdfGenerator';
import { Client, Invoice } from '../types';
import { DollarSign, FileText, Download, CheckCircle, AlertCircle, Search, CreditCard, X, Check, Filter, Hash, Wallet, Building, Clock, Calendar, Trash2 } from 'lucide-react';

const MinimalInput = ({ label, value, onChange, type = "text", required = false, placeholder = "", icon: Icon }: any) => (
    <div className="group relative pt-6">
      <div className="absolute top-9 left-0 text-slate-400">{Icon && <Icon size={18} />}</div>
      <input type={type} required={required} value={value} onChange={onChange} placeholder={placeholder || " "} className={`peer w-full py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent focus:placeholder-slate-300 ${Icon ? 'pl-8' : 'px-0'}`} />
      <label className={`absolute left-0 top-1 text-xs text-slate-400 font-medium transition-all uppercase tracking-wide peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-9 peer-focus:top-1 peer-focus:text-xs peer-focus:text-slate-800 pointer-events-none ${Icon ? 'peer-placeholder-shown:left-8 peer-focus:left-0' : ''}`}>{label}</label>
    </div>
);
const MinimalSelect = ({ label, value, onChange, options, icon: Icon }: any) => (
  <div className="group relative pt-6">
    <div className="absolute top-9 left-0 text-slate-400 pointer-events-none z-10">{Icon && <Icon size={18} />}</div>
    <select value={value} onChange={onChange} className={`peer w-full py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer ${Icon ? 'pl-8' : 'px-0'}`} >{options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select>
    <label className={`absolute left-0 top-1 text-xs text-slate-400 font-medium uppercase tracking-wide transition-all ${Icon ? 'left-0' : ''}`}>{label}</label>
  </div>
);

export const Payments: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'Invoices' | 'History' | 'Statements' | 'Schedule'>('Invoices');
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [allReceipts, setAllReceipts] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Pending'>('All');
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentDetails, setPaymentDetails] = useState({ method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0] });
    const clients = getClients();
    const upcomingBillings = getUpcomingBillings();

    const getBillboardName = (id: string) => getBillboards().find(b => b.id === id)?.name || 'Unknown';

    useEffect(() => { const loadData = () => { const allDocs = getInvoices(); setAllInvoices(allDocs.filter(i => i.type === 'Invoice')); setAllReceipts(allDocs.filter(i => i.type === 'Receipt')); }; loadData(); }, [activeTab, selectedInvoice]);

    const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown';
    const handleOpenPaymentModal = (invoice: Invoice) => { setSelectedInvoice(invoice); setPaymentDetails({ method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0] }); };
    const confirmPayment = () => { if (selectedInvoice) { const receipt: Invoice = { id: `RCT-${Date.now()}`, clientId: selectedInvoice.clientId, date: paymentDetails.date, items: [{ description: `Payment for Invoice #${selectedInvoice.id}`, amount: selectedInvoice.total }], subtotal: selectedInvoice.total, vatAmount: 0, total: selectedInvoice.total, status: 'Paid', type: 'Receipt', contractId: selectedInvoice.contractId, paymentMethod: paymentDetails.method as any, paymentReference: paymentDetails.reference }; addInvoice(receipt); markInvoiceAsPaid(selectedInvoice.id); const allDocs = getInvoices(); setAllInvoices(allDocs.filter(i => i.type === 'Invoice')); setAllReceipts(allDocs.filter(i => i.type === 'Receipt')); setSelectedInvoice(null); setPaymentDetails({ method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0] }); alert("Payment Recorded Successfully! Receipt Generated."); } };

    const handleDeleteReceipt = (receiptId: string) => {
        if(window.confirm("Are you sure you want to delete this payment record? This may affect the balance.")) {
            deleteInvoice(receiptId);
            // Refresh data
            const allDocs = getInvoices();
            setAllReceipts(allDocs.filter(i => i.type === 'Receipt'));
        }
    }

    const filteredInvoices = allInvoices.filter(inv => { const matchesStatus = statusFilter === 'All' ? true : inv.status === statusFilter; const searchLower = searchTerm.toLowerCase(); const clientName = getClientName(inv.clientId).toLowerCase(); const matchesSearch = inv.id.toLowerCase().includes(searchLower) || clientName.includes(searchLower); return matchesStatus && matchesSearch; });
    const filteredReceipts = allReceipts.filter(r => { const searchLower = searchTerm.toLowerCase(); const clientName = getClientName(r.clientId).toLowerCase(); return r.id.toLowerCase().includes(searchLower) || clientName.includes(searchLower) || (r.paymentReference && r.paymentReference.toLowerCase().includes(searchLower)); });

    return (
        <>
            <div className="space-y-8 animate-fade-in">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                     <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Payments & Statements</h2><p className="text-slate-500 font-medium">Track outstanding balances and process transactions</p></div>
                     <div className="flex bg-slate-100 rounded-full p-1 border border-slate-200 overflow-x-auto max-w-full"><button onClick={() => setActiveTab('Invoices')} className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'Invoices' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Invoices</button><button onClick={() => setActiveTab('History')} className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'History' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>History</button><button onClick={() => setActiveTab('Statements')} className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'Statements' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Statements</button><button onClick={() => setActiveTab('Schedule')} className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'Schedule' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Schedule</button></div>
                 </div>
                 {activeTab === 'Invoices' && (<div className="space-y-6"><div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100"><div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">{(['All', 'Pending', 'Paid'] as const).map(status => (<button key={status} onClick={() => setStatusFilter(status)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border ${statusFilter === status ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{status}</button>))}</div><div className="relative group w-full sm:w-64"><Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Client or ID..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:bg-white focus:border-slate-800 transition-all text-sm"/></div></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{filteredInvoices.map(invoice => (<div key={invoice.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg transition-all group flex flex-col justify-between hover:-translate-y-1 duration-300"><div><div className="flex justify-between items-start mb-4"><div className="p-3 bg-slate-50 rounded-xl group-hover:bg-slate-100 transition-colors">{invoice.status === 'Paid' ? <CheckCircle className="text-green-500" size={24}/> : <AlertCircle className="text-amber-500" size={24}/>}</div><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${invoice.status === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>{invoice.status}</span></div><h3 className="text-lg font-bold text-slate-900 mb-1">{getClientName(invoice.clientId)}</h3><p className="text-sm text-slate-500 mb-6">Inv #{invoice.id} • {invoice.date}</p><div className="space-y-3 mb-6"><div className="flex justify-between items-center text-sm"><span className="text-slate-400 font-medium">Amount Due</span><span className="font-bold text-slate-900 text-lg">${invoice.total.toLocaleString()}</span></div></div></div>{invoice.status === 'Pending' && (<button onClick={() => handleOpenPaymentModal(invoice)} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2"><CreditCard size={14} /> Receive Payment</button>)}{invoice.status === 'Paid' && (<div className="w-full py-3 bg-slate-50 text-slate-400 rounded-xl font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 cursor-default border border-slate-100"><Check size={14} /> Paid in Full</div>)}</div>))}{filteredInvoices.length === 0 && (<div className="col-span-full py-12 text-center text-slate-400 italic bg-white rounded-2xl border border-slate-100 border-dashed">No invoices found matching your criteria.</div>)}</div></div>)}
                 {activeTab === 'History' && (<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in"><div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4"><div className="flex items-center gap-2 text-slate-500"><Clock size={18} /> <span className="text-sm font-bold uppercase tracking-wider">Payment History</span></div><div className="relative group w-full sm:w-64"><Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Ref, ID, Client..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:border-slate-800 transition-all text-sm"/></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[700px]"><thead className="bg-slate-50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Payment Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Receipt ID</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Method</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Reference</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Amount</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredReceipts.map(receipt => (<tr key={receipt.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{receipt.date}</td><td className="px-6 py-4 font-bold text-slate-900">{receipt.id}</td><td className="px-6 py-4">{getClientName(receipt.clientId)}</td><td className="px-6 py-4"><span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold uppercase">{receipt.paymentMethod || 'N/A'}</span></td><td className="px-6 py-4 font-mono text-xs text-slate-500">{receipt.paymentReference || '-'}</td><td className="px-6 py-4 text-right font-bold text-green-600">${receipt.total.toLocaleString()}</td><td className="px-6 py-4 text-right"><button onClick={() => handleDeleteReceipt(receipt.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16}/></button></td></tr>))}{filteredReceipts.length === 0 && (<tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">No payment history found.</td></tr>)}</tbody></table></div></div>)}
                 {activeTab === 'Statements' && (<div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in"><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[600px]"><thead className="bg-slate-50/50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Total Billed</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Total Paid</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Balance</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{clients.map(client => { const financials = getClientFinancials(client.id); return (<tr key={client.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4"><div className="font-bold text-slate-900">{client.companyName}</div><div className="text-xs text-slate-400">{client.email}</div></td><td className="px-6 py-4 text-right">${financials.totalBilled.toLocaleString()}</td><td className="px-6 py-4 text-right text-green-600">${financials.totalPaid.toLocaleString()}</td><td className={`px-6 py-4 text-right font-bold ${financials.balance > 0 ? 'text-red-500' : 'text-slate-400'}`}>${financials.balance.toLocaleString()}</td><td className="px-6 py-4 text-center"><button onClick={() => { const transactions = getTransactions(client.id); const activeRentals = getContracts().filter(c => c.clientId === client.id && c.status === 'Active'); generateStatementPDF(client, transactions, activeRentals, getBillboardName); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Download Statement"><Download size={18} /></button></td></tr>) })}</tbody></table></div></div>)}
                 {activeTab === 'Schedule' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Calendar size={20} className="text-indigo-600"/> Payment Schedule</h3>
                                <p className="text-xs text-slate-500 mt-1">Upcoming billing dates based on active contracts</p>
                            </div>
                            <button onClick={() => generatePaymentSchedulePDF(upcomingBillings)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all hover:bg-slate-50">
                                <Download size={14}/> PDF Schedule
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-600 min-w-[700px]">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client</th>
                                        <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Billing Cycle Day</th>
                                        <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Next Due Date</th>
                                        <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Est. Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {upcomingBillings.map((item, index) => (
                                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-900">{item.clientName}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold uppercase">{item.day} of month</span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-700">{item.date}</td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-900">${item.amount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {upcomingBillings.length === 0 && (
                                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No upcoming scheduled payments found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                 )}
            </div>
             {/* ... Payment Modal remains the same ... */}
             {selectedInvoice && (<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all animate-fade-in"><div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full border border-white/20 overflow-hidden transform scale-100"><div className="bg-slate-900 p-6 text-white flex justify-between items-start"><div><h3 className="text-xl font-bold tracking-tight">Record Payment</h3><p className="text-slate-400 text-sm mt-1">Invoice #{selectedInvoice.id}</p></div><button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button></div><div className="p-8"><div className="bg-slate-50 rounded-2xl p-6 mb-8 text-center border border-slate-100"><p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Total Amount Due</p><h2 className="text-4xl font-extrabold text-slate-900 tracking-tighter">${selectedInvoice.total.toLocaleString()}</h2><p className="text-sm font-medium text-slate-500 mt-2">{getClientName(selectedInvoice.clientId)}</p></div><div className="space-y-6"><div className="grid grid-cols-2 gap-6"><div className="col-span-2"><MinimalInput label="Payment Date" type="date" value={paymentDetails.date} onChange={(e: any) => setPaymentDetails({...paymentDetails, date: e.target.value})} icon={Calendar} required /></div><div className="col-span-2"><MinimalSelect label="Payment Method" value={paymentDetails.method} onChange={(e: any) => setPaymentDetails({...paymentDetails, method: e.target.value})} icon={Wallet} options={[{value: 'Bank Transfer', label: 'Bank Transfer'},{value: 'Cash', label: 'Cash'},{value: 'EcoCash', label: 'EcoCash Mobile Money'},{value: 'Other', label: 'Other'}]} /></div></div><MinimalInput label="Reference Number / Proof" value={paymentDetails.reference} onChange={(e: any) => setPaymentDetails({...paymentDetails, reference: e.target.value})} icon={Hash} placeholder="e.g. POP-12345" required /></div><button onClick={confirmPayment} className="w-full mt-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2"><Check size={20} /> Confirm Payment</button></div></div></div>)}
        </>
    );
};
