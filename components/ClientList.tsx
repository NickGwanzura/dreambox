
import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { getClients, addClient, deleteClient, updateClient, getNextBillingDetails, subscribe } from '../services/mockData';
import { generateClientDirectoryPDF } from '../services/pdfGenerator';
import { Mail, Phone, MoreHorizontal, User, Plus, X, Save, Search, Trash2, AlertTriangle, Calendar, Clock, Edit2, CreditCard, Share2, Download, CheckCircle } from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { canDelete } from '../utils/settingsAccess';

const MinimalInput = ({ label, value, onChange, type = "text", placeholder, required = false, max, min, step }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} max={max} min={min} step={step} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

export const ClientList: React.FC = () => {
  const canUserDelete = canDelete(getCurrentUser());
  const [clients, setClients] = useState<Client[]>(getClients());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [newClient, setNewClient] = useState<Partial<Client>>({ companyName: '', contactPerson: '', email: '', phone: '', status: 'Active', billingDay: undefined });

  // Real-time Subscription
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          setClients([...getClients()]);
      });
      return () => { unsubscribe(); };
  }, []);

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    const client: Client = {
        id: (Date.now()).toString(),
        companyName: newClient.companyName || 'New Company',
        contactPerson: newClient.contactPerson || 'N/A',
        email: newClient.email || '',
        phone: newClient.phone || '',
        status: 'Active',
        billingDay: newClient.billingDay
    };
    addClient(client); setIsAddModalOpen(false); setNewClient({ companyName: '', contactPerson: '', email: '', phone: '', status: 'Active', billingDay: undefined });
  };

  const handleUpdateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if(editingClient) {
        updateClient(editingClient);
        setEditingClient(null);
    }
  };

  const handleConfirmDelete = () => { if (clientToDelete) { deleteClient(clientToDelete.id); setClientToDelete(null); } };

  const generatePortalLink = (client: Client) => {
      // Use the premium domain requested
      const link = `https://admin.dreamboxadvertising.com/?portal=true&clientId=${client.id}`;
      navigator.clipboard.writeText(link);
      alert(`Client Portal Link Copied!\n${link}`);
  };

  return (
    <>
      <div className="space-y-8 relative animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Client Directory</h2><p className="text-slate-500 font-medium">Manage advertising partners and contact details</p></div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
              <button onClick={() => generateClientDirectoryPDF(clients)} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2">
                  <Download size={18}/> Directory
              </button>
              <div className="relative group w-full sm:w-64">
                  <Search className="absolute left-0 top-2.5 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} />
                  <input type="text" placeholder="Search clients..." className="w-full pl-8 py-2 border-b border-slate-200 bg-transparent outline-none focus:border-slate-800 transition-colors"/>
              </div>
              <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105">
                  <Plus size={18} /> <span className="hidden sm:inline">New Client</span>
              </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {clients.map(client => {
                const billingInfo = getNextBillingDetails(client.id);
                return (
                <div key={client.id} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 group hover:-translate-y-1 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-14 h-14 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center font-bold text-xl group-hover:bg-slate-900 group-hover:text-white transition-colors shadow-sm">{client.companyName.charAt(0)}</div>
                            <div className="flex gap-1">
                                <button onClick={() => generatePortalLink(client)} className="text-slate-300 hover:text-green-600 transition-colors p-2 hover:bg-green-50 rounded-full" title="Copy Client Portal Link"><Share2 size={18} /></button>
                                <button onClick={() => setEditingClient(client)} className="text-slate-300 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full" title="Edit Client"><Edit2 size={18} /></button>
                                {canUserDelete && (<button onClick={() => setClientToDelete(client)} className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full" title="Delete Client"><Trash2 size={18} /></button>)}
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-1">{client.companyName}</h3><div className="flex items-center gap-2 text-sm text-slate-500 mb-6 font-medium"><User size={14} className="text-indigo-500"/> {client.contactPerson}</div>
                        <div className="space-y-3 border-t border-slate-50 pt-4 mb-4"><div className="flex items-center gap-3 text-sm text-slate-600 group-hover:text-slate-900 transition-colors"><Mail size={16} className="text-slate-400" /> {client.email}</div><div className="flex items-center gap-3 text-sm text-slate-600 group-hover:text-slate-900 transition-colors"><Phone size={16} className="text-slate-400" /> {client.phone}</div></div>

                        {billingInfo ? (
                             <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 mb-4">
                                 <div className="flex items-center justify-between mb-1">
                                     <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-400">Next Bill</span>
                                     <span className="text-xs font-bold text-indigo-700">${billingInfo.amount.toLocaleString()}</span>
                                 </div>
                                 <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                                     <Clock size={14} /> {billingInfo.date} {client.billingDay && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-indigo-100 text-indigo-400 font-normal">Fixed: Day {client.billingDay}</span>}
                                 </div>
                             </div>
                        ) : client.billingDay ? (
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4">
                                 <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                                     <Calendar size={14} /> Bill Day: <span className="font-bold text-slate-700">{client.billingDay}th</span> of month
                                 </div>
                             </div>
                        ) : null}
                    </div>
                    <div className="flex justify-between items-center pt-2"><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${client.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{client.status}</span><button onClick={() => setEditingClient(client)} className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1">View Details <MoreHorizontal size={14}/></button></div>
                </div>
            )})}
        </div>
      </div>

      {/* Add Client Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Add New Client</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Create a new advertising partner record</p>
                    </div>
                    <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                </div>
                <form onSubmit={handleAddClient} className="p-8 space-y-6">
                    {/* Company Information */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Company Information</p>
                        <div className="space-y-6">
                            <div>
                                <MinimalInput label="Company Name" value={newClient.companyName} onChange={(e: any) => setNewClient({...newClient, companyName: e.target.value})} required />
                            </div>
                            <div>
                                <MinimalInput label="Contact Person" value={newClient.contactPerson} onChange={(e: any) => setNewClient({...newClient, contactPerson: e.target.value})} required />
                                <p className="text-[10px] text-slate-400 mt-2">Primary point of contact for this account</p>
                            </div>
                        </div>
                    </div>

                    {/* Contact Details */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Contact Details</p>
                        <div className="space-y-6">
                            <MinimalInput label="Email Address" type="email" value={newClient.email} onChange={(e: any) => setNewClient({...newClient, email: e.target.value})} required />
                            <MinimalInput label="Phone Number" type="tel" value={newClient.phone} onChange={(e: any) => setNewClient({...newClient, phone: e.target.value})} />
                        </div>
                    </div>

                    {/* Billing Preferences */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard size={15} className="text-slate-400" />
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Billing Preferences</p>
                        </div>
                        <MinimalInput
                            label="Billing Day (1–31)"
                            type="number"
                            min={1}
                            max={31}
                            value={newClient.billingDay || ''}
                            onChange={(e: any) => setNewClient({...newClient, billingDay: e.target.value ? Number(e.target.value) : undefined})}
                        />
                        <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                            Day of the month invoices are generated. Leave blank to use each contract's start date. E.g. "25" consolidates all invoices for this client to the 25th.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                        <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><Save size={14} /> Save Client</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Edit Client</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{editingClient.companyName} &bull; {editingClient.status}</p>
                    </div>
                    <button onClick={() => setEditingClient(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                </div>
                <form onSubmit={handleUpdateClient} className="p-8 space-y-6">
                    {/* Context summary card */}
                    <div className="bg-slate-900 text-white rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg">{editingClient.companyName.charAt(0)}</div>
                            <div>
                                <p className="font-bold text-base leading-tight">{editingClient.companyName}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{editingClient.contactPerson}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Email</p>
                                <p className="text-sm text-slate-300 truncate">{editingClient.email || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Phone</p>
                                <p className="text-sm text-slate-300">{editingClient.phone || '—'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Company Information */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Company Information</p>
                        <div className="space-y-6">
                            <MinimalInput label="Company Name" value={editingClient.companyName} onChange={(e: any) => setEditingClient({...editingClient, companyName: e.target.value})} required />
                            <MinimalInput label="Contact Person" value={editingClient.contactPerson} onChange={(e: any) => setEditingClient({...editingClient, contactPerson: e.target.value})} required />
                        </div>
                    </div>

                    {/* Contact Details */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Contact Details</p>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Email Address" type="email" value={editingClient.email} onChange={(e: any) => setEditingClient({...editingClient, email: e.target.value})} required />
                            <MinimalInput label="Phone Number" type="tel" value={editingClient.phone} onChange={(e: any) => setEditingClient({...editingClient, phone: e.target.value})} />
                        </div>
                    </div>

                    {/* Billing Preferences */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard size={15} className="text-slate-400" />
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Billing Preferences</p>
                        </div>
                        <MinimalInput
                            label="Preferred Billing Day (1–31)"
                            type="number"
                            min={1}
                            max={31}
                            value={editingClient.billingDay || ''}
                            onChange={(e: any) => setEditingClient({...editingClient, billingDay: e.target.value ? Number(e.target.value) : undefined})}
                            placeholder="Default: Contract Start Date"
                        />
                        <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                            Setting a fixed billing day (e.g. 25) consolidates all invoices for this client to that day of the month, overriding individual contract start dates.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setEditingClient(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                        <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><CheckCircle size={14} /> Update Client</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Delete Client Confirmation */}
      {clientToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-sm w-full border border-white/20">
                {/* Header */}
                <div className="p-6 border-b border-red-100 bg-red-50 rounded-t-3xl flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-red-200">
                        <Trash2 className="text-red-600" size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-red-900">Delete Client?</h3>
                        <p className="text-xs text-red-500 mt-0.5 font-medium">This action cannot be undone.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {/* Entity being deleted */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Client Being Deleted</p>
                        <p className="font-bold text-slate-900">{clientToDelete.companyName}</p>
                        <p className="text-sm text-slate-600 flex items-center gap-2"><User size={13} className="text-slate-400" /> {clientToDelete.contactPerson}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-2"><Mail size={13} className="text-slate-400" /> {clientToDelete.email || '—'}</p>
                        <p className="text-xs text-slate-400 font-mono mt-1">ID: {clientToDelete.id}</p>
                    </div>
                    {/* Cascading impact warning */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 font-medium">Any contracts, invoices, and billing records linked to this client will be orphaned. This cannot be reversed.</p>
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button onClick={() => setClientToDelete(null)} className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Keep Client</button>
                        <button onClick={handleConfirmDelete} className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-600/20">Delete Permanently</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
