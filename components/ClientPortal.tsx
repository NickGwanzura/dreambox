import React, { useState, useEffect } from 'react';
import { getClients, getContracts, getBillboards, getInvoices } from '../services/mockData';
import { Client, Contract, Invoice, Billboard } from '../types';
import { MapPin, Calendar, CreditCard, Clock, FileText, LayoutDashboard, Globe, AlertTriangle, ArrowRight, TrendingUp } from 'lucide-react';
import { generateStatementPDF } from '../services/pdfGenerator';

interface ClientPortalProps {
    clientId: string;
}

export const ClientPortal: React.FC<ClientPortalProps> = ({ clientId }) => {
    const [client, setClient] = useState<Client | null>(null);
    const [activeContracts, setActiveContracts] = useState<Contract[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate loading
        setTimeout(() => {
            const foundClient = getClients().find(c => c.id === clientId);
            if (foundClient) {
                setClient(foundClient);
                const clientContracts = getContracts().filter(c => c.clientId === clientId && c.status === 'Active');
                const clientInvoices = getInvoices().filter(i => i.clientId === clientId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setActiveContracts(clientContracts);
                setInvoices(clientInvoices);
            }
            setLoading(false);
        }, 1000);
    }, [clientId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider animate-pulse">Loading Portal...</p>
                </div>
            </div>
        );
    }

    if (!client) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500">
                <AlertTriangle size={48} className="mb-4 text-slate-300"/>
                <h2 className="text-xl font-bold text-slate-800">Portal Not Found</h2>
                <p>Invalid Client ID or expired session.</p>
            </div>
        );
    }

    const totalDue = invoices.filter(i => i.status === 'Pending').reduce((acc, curr) => acc + curr.total, 0);
    const lastPayment = invoices.find(i => i.type === 'Receipt');

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">D</div>
                        <div>
                            <h1 className="text-lg font-bold leading-none text-slate-900 tracking-tight">Dreambox Portal</h1>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">Welcome, {client.companyName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:block text-right">
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Account Status</p>
                            <p className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                            {client.companyName.charAt(0)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
                
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform"><MapPin size={24}/></div>
                            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">Live</span>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Active Assets</p>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{activeContracts.length}</h3>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 group">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-2xl transition-transform group-hover:scale-110 ${totalDue > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}><CreditCard size={24}/></div>
                            {totalDue > 0 && <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-1 rounded-lg flex items-center gap-1"><AlertTriangle size={12}/> Due</span>}
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Outstanding Balance</p>
                        <h3 className={`text-3xl font-black tracking-tight ${totalDue > 0 ? 'text-red-600' : 'text-slate-900'}`}>${totalDue.toLocaleString()}</h3>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-slate-50 text-slate-600 rounded-2xl group-hover:scale-110 transition-transform"><TrendingUp size={24}/></div>
                            <span className="text-xs font-bold text-slate-400">{lastPayment?.date || 'N/A'}</span>
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Last Payment</p>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{lastPayment ? `$${lastPayment.total.toLocaleString()}` : '-'}</h3>
                    </div>
                </div>

                {/* Active Campaigns - Enhanced Cards */}
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                            <span className="p-2 bg-slate-900 text-white rounded-lg"><MapPin size={20}/></span> 
                            Active Campaigns
                        </h2>
                        <span className="text-sm font-medium text-slate-500">{activeContracts.length} Locations deployed</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {activeContracts.map(contract => {
                            const billboard = getBillboards().find(b => b.id === contract.billboardId);
                            if(!billboard) return null;
                            return (
                                <div key={contract.id} className="group bg-white rounded-[2rem] overflow-hidden border border-slate-200 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 flex flex-col h-full hover:-translate-y-1">
                                    {/* Card Image */}
                                    <div className="h-56 bg-slate-100 relative overflow-hidden">
                                        {billboard.imageUrl ? (
                                            <img src={billboard.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"/>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                                                <Globe size={48} strokeWidth={1.5} />
                                            </div>
                                        )}
                                        {/* Gradient Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity duration-500" />
                                        
                                        {/* Top Badges */}
                                        <div className="absolute top-4 right-4 flex gap-2">
                                             <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-sm border border-white/20">
                                                {billboard.type}
                                            </span>
                                        </div>
                                        
                                        {/* Bottom Overlay Text */}
                                        <div className="absolute bottom-0 left-0 w-full p-6 text-white translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                                            <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                <MapPin size={12}/> {billboard.town}
                                            </p>
                                            <h3 className="text-xl font-bold leading-tight mb-1">{billboard.name}</h3>
                                            <p className="text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity delay-100 truncate">{billboard.location}</p>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-6 flex-1 flex flex-col">
                                        
                                        <div className="grid grid-cols-2 gap-3 mb-6">
                                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Dimensions</p>
                                                <p className="text-sm font-bold text-slate-700">{billboard.width}m x {billboard.height}m</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Booking</p>
                                                <p className="text-sm font-bold text-slate-700 truncate">{contract.details}</p>
                                            </div>
                                        </div>

                                        <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Contract Duration</p>
                                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                        <span className="bg-white border border-slate-200 px-2 py-1 rounded-md">{contract.startDate}</span>
                                                        <ArrowRight size={12} className="text-slate-400"/>
                                                        <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-md">{contract.endDate}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Active</span>
                                                </div>
                                                <div className="text-right">
                                                     <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Rate / Month</p>
                                                     <p className="text-lg font-black text-slate-900">${contract.monthlyRate.toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Recent Invoices */}
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                            <span className="p-2 bg-slate-900 text-white rounded-lg"><CreditCard size={20}/></span> 
                            Financial History
                        </h2>
                    </div>
                    
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-8 py-5 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th>
                                        <th className="px-8 py-5 font-bold text-xs uppercase text-slate-400 tracking-wider">Reference</th>
                                        <th className="px-8 py-5 font-bold text-xs uppercase text-slate-400 tracking-wider">Type</th>
                                        <th className="px-8 py-5 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Amount</th>
                                        <th className="px-8 py-5 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.slice(0, 10).map(inv => (
                                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-8 py-5 font-mono text-xs font-medium text-slate-500">{inv.date}</td>
                                            <td className="px-8 py-5 font-bold text-slate-900">{inv.id}</td>
                                            <td className="px-8 py-5 text-xs font-bold uppercase tracking-wider text-slate-500">{inv.type}</td>
                                            <td className="px-8 py-5 text-right font-bold text-slate-900">${inv.total.toLocaleString()}</td>
                                            <td className="px-8 py-5 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{inv.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {invoices.length === 0 && (
                                        <tr><td colSpan={5} className="px-8 py-8 text-center text-slate-400 italic">No financial history available.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button onClick={() => generateStatementPDF(client, invoices, activeContracts, (id) => getBillboards().find(b => b.id === id)?.name || 'Unknown')} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2 hover:-translate-y-0.5">
                                <FileText size={16}/> Download Full Statement
                            </button>
                        </div>
                    </div>
                </div>

                <div className="text-center text-slate-400 text-xs py-8">
                    &copy; {new Date().getFullYear()} Dreambox Advertising. All rights reserved.
                </div>

            </div>
        </div>
    );
};