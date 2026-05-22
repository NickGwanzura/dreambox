
import React, { useState, useEffect, useMemo } from 'react';
import { Client, Contract } from '../types';
import { getClients, addClient, deleteClient, updateClient, getNextBillingDetails, getContracts, subscribe } from '../services/mockData';
import { generateClientDirectoryPDF } from '../services/pdfGenerator';
import { Mail, Phone, MoreHorizontal, User, Plus, X, Save, Search, Trash2, AlertTriangle, Calendar, Clock, Edit2, CreditCard, Share2, Download, Upload, CheckCircle, FileText } from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { canDelete } from '../utils/settingsAccess';
import { ClientDetail } from './ClientDetail';

const MinimalInput = ({ label, value, onChange, type = "text", placeholder, required = false, max, min, step }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} max={max} min={min} step={step} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

export const ClientList: React.FC = () => {
  const canUserDelete = canDelete(getCurrentUser());
  const [clients, setClients] = useState<Client[]>(getClients());
  const [contracts, setContracts] = useState<Contract[]>(getContracts());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importResult, setImportResult] = useState<{ updated: number; created: number; skipped: number; details: string[] } | null>(null);

  const activeContractsByClient = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contracts) {
      if (c.status === 'Active') map[c.clientId] = (map[c.clientId] || 0) + 1;
    }
    return map;
  }, [contracts]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.companyName?.toLowerCase().includes(q) ||
      c.contactPerson?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  const [newClient, setNewClient] = useState<Partial<Client>>({ companyName: '', contactPerson: '', email: '', phone: '', status: 'Active', billingDay: undefined });

  // Real-time Subscription
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          setClients([...getClients()]);
          setContracts([...getContracts()]);
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

  // Parse a CSV line respecting quoted fields and escaped quotes ("")
  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') { inQuotes = true; }
        else { cur += ch; }
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const downloadClientsTemplate = () => {
    const header = ['Company Name', 'Contact Person', 'Email', 'Phone', 'Billing Day', 'Status'];
    const lines = [header.join(',')];
    for (const c of clients) {
      const row = [c.companyName, c.contactPerson, c.email, c.phone, String(c.billingDay ?? ''), c.status]
        .map(v => {
          const s = (v ?? '').toString();
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        });
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients_template_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClients = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || '';
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) {
        setImportResult({ updated: 0, created: 0, skipped: 0, details: ['CSV is empty or has no data rows.'] });
        return;
      }
      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      const idx = (name: string) => headers.findIndex(h => h === name.toLowerCase());
      const iCompany = idx('company name');
      const iContact = idx('contact person');
      const iEmail = idx('email');
      const iPhone = idx('phone');
      const iBilling = idx('billing day');
      const iStatus = idx('status');

      if (iCompany === -1) {
        setImportResult({ updated: 0, created: 0, skipped: 0, details: ['Required header "Company Name" not found.'] });
        return;
      }

      const current = getClients();
      const byName = new Map(current.map(c => [c.companyName.toLowerCase().trim(), c]));
      let updated = 0, created = 0, skipped = 0;
      const details: string[] = [];

      for (let r = 1; r < lines.length; r++) {
        const cols = parseCsvLine(lines[r]);
        const companyName = (cols[iCompany] || '').trim();
        if (!companyName) { skipped++; continue; }

        const contact = iContact >= 0 ? (cols[iContact] || '').trim() : '';
        const email = iEmail >= 0 ? (cols[iEmail] || '').trim() : '';
        const phone = iPhone >= 0 ? (cols[iPhone] || '').trim() : '';
        const billingRaw = iBilling >= 0 ? (cols[iBilling] || '').trim() : '';
        const billingDay = billingRaw ? Math.min(31, Math.max(1, parseInt(billingRaw, 10) || 0)) || undefined : undefined;
        const status = iStatus >= 0 ? (cols[iStatus] || '').trim() : '';

        const existing = byName.get(companyName.toLowerCase().trim());
        if (existing) {
          const merged: Client = {
            ...existing,
            contactPerson: contact || existing.contactPerson,
            email: email || existing.email,
            phone: phone || existing.phone,
            billingDay: billingDay !== undefined ? billingDay : existing.billingDay,
            status: (status === 'Active' || status === 'Inactive') ? status : existing.status,
          };
          const changed =
            merged.contactPerson !== existing.contactPerson ||
            merged.email !== existing.email ||
            merged.phone !== existing.phone ||
            merged.billingDay !== existing.billingDay ||
            merged.status !== existing.status;
          if (changed) { updateClient(merged); updated++; }
          else { skipped++; }
        } else {
          const newClient: Client = {
            id: `CLI-${Date.now()}-${Math.floor(Math.random() * 1000)}-${r}`,
            companyName,
            contactPerson: contact || 'N/A',
            email,
            phone,
            status: (status === 'Inactive') ? 'Inactive' : 'Active',
            billingDay,
          };
          addClient(newClient);
          byName.set(companyName.toLowerCase().trim(), newClient);
          created++;
        }
      }

      if (updated === 0 && created === 0) {
        details.push('No changes detected. Verify your CSV has new values for Contact Person, Email, Phone, or Billing Day.');
      }
      setImportResult({ updated, created, skipped, details });
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected later
    e.target.value = '';
  };

  const generatePortalLink = (client: Client) => {
      // Use the premium domain requested
      const link = `https://admin.dreamboxadvertising.com/?portal=true&clientId=${client.id}`;
      navigator.clipboard.writeText(link);
      alert(`Client Portal Link Copied!\n${link}`);
  };

  const viewingClient = viewingClientId ? clients.find(c => c.id === viewingClientId) : null;

  if (viewingClient) {
    return (
      <>
        <ClientDetail
          client={viewingClient}
          onBack={() => setViewingClientId(null)}
          onEdit={(c) => setEditingClient(c)}
        />
        {/* Edit Client Modal (shared) */}
        {editingClient && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Edit Client</h3>
                  <p className="text-xs text-slate-900 mt-0.5">{editingClient.companyName} &bull; {editingClient.status}</p>
                </div>
                <button onClick={() => setEditingClient(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
              </div>
              <form onSubmit={handleUpdateClient} className="p-8 space-y-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Company Information</p>
                  <div className="space-y-6">
                    <MinimalInput label="Company Name" value={editingClient.companyName} onChange={(e: any) => setEditingClient({...editingClient, companyName: e.target.value})} required />
                    <MinimalInput label="Contact Person" value={editingClient.contactPerson} onChange={(e: any) => setEditingClient({...editingClient, contactPerson: e.target.value})} required />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Contact Details</p>
                  <div className="grid grid-cols-2 gap-6">
                    <MinimalInput label="Email Address" type="email" value={editingClient.email} onChange={(e: any) => setEditingClient({...editingClient, email: e.target.value})} />
                    <MinimalInput label="Phone Number" type="tel" value={editingClient.phone} onChange={(e: any) => setEditingClient({...editingClient, phone: e.target.value})} />
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard size={15} className="text-slate-900" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Billing Preferences</p>
                  </div>
                  <MinimalInput label="Preferred Billing Day (1–31)" type="number" min={1} max={31} value={editingClient.billingDay || ''} onChange={(e: any) => setEditingClient({...editingClient, billingDay: e.target.value ? Number(e.target.value) : undefined})} placeholder="Default: Contract Start Date" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditingClient(null)} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"><CheckCircle size={14} /> Update Client</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-8 relative animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Client Directory</h2><p className="text-slate-900 font-medium">Manage advertising partners and contact details</p></div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
              <button onClick={() => generateClientDirectoryPDF(clients)} className="bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2">
                  <Download size={18}/> Directory
              </button>
              <button onClick={downloadClientsTemplate} title="Export current clients as CSV (fill in missing contact info, then re-upload)" className="bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2">
                  <FileText size={18}/> Template
              </button>
              <label title="Upload CSV to update client info (matched by company name) or add new clients" className="bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer">
                  <Upload size={18}/> Import
                  <input type="file" accept=".csv,text/csv" onChange={handleImportClients} className="hidden" />
              </label>
              <div className="relative group w-full sm:w-64">
                  <Search className="absolute left-0 top-2.5 text-slate-900 group-focus-within:text-slate-800 transition-colors" size={18} />
                  <input
                      type="text"
                      placeholder="Search clients..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-2 border-b border-slate-200 bg-transparent outline-none focus:border-slate-800 transition-colors"
                  />
                  {searchQuery && (
                      <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-0 top-2.5 text-slate-300 hover:text-slate-700 transition-colors"
                          title="Clear search"
                      >
                          <X size={16} />
                      </button>
                  )}
              </div>
              <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105">
                  <Plus size={18} /> <span className="hidden sm:inline">New Client</span>
              </button>
          </div>
        </div>
        {searchQuery && (
            <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                {filteredClients.length} of {clients.length} clients match "{searchQuery}"
            </p>
        )}
        {filteredClients.length === 0 && searchQuery ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                <Search size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-900 font-medium">No clients found matching "{searchQuery}"</p>
                <button onClick={() => setSearchQuery('')} className="text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 mt-3">Clear Search</button>
            </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredClients.map(client => {
                const billingInfo = getNextBillingDetails(client.id);
                const activeCount = activeContractsByClient[client.id] || 0;
                return (
                <div key={client.id} onClick={() => setViewingClientId(client.id)} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 group hover:-translate-y-1 flex flex-col justify-between cursor-pointer">
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-14 h-14 rounded-full bg-slate-50 text-slate-900 flex items-center justify-center font-bold text-xl group-hover:bg-slate-900 group-hover:text-white transition-colors shadow-sm">{client.companyName.charAt(0)}</div>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => generatePortalLink(client)} className="text-slate-300 hover:text-green-600 transition-colors p-2 hover:bg-green-50 rounded-full" title="Copy Client Portal Link"><Share2 size={18} /></button>
                                <button onClick={() => setEditingClient(client)} className="text-slate-300 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full" title="Edit Client"><Edit2 size={18} /></button>
                                {canUserDelete && (<button onClick={() => setClientToDelete(client)} className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full" title="Delete Client"><Trash2 size={18} /></button>)}
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-1">{client.companyName}</h3><div className="flex items-center gap-2 text-sm text-slate-900 mb-6 font-medium"><User size={14} className="text-indigo-500"/> {client.contactPerson}</div>
                        <div className="space-y-3 border-t border-slate-50 pt-4 mb-4"><div className="flex items-center gap-3 text-sm text-slate-900 group-hover:text-slate-900 transition-colors"><Mail size={16} className="text-slate-900" /> {client.email}</div><div className="flex items-center gap-3 text-sm text-slate-900 group-hover:text-slate-900 transition-colors"><Phone size={16} className="text-slate-900" /> {client.phone}</div></div>

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
                                 <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                     <Calendar size={14} /> Bill Day: <span className="font-bold text-slate-700">{client.billingDay}th</span> of month
                                 </div>
                             </div>
                        ) : null}
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${client.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-50 text-slate-900 border-slate-100'}`}>{client.status}</span>
                            {activeCount > 0 ? (
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border bg-indigo-50 text-indigo-600 border-indigo-100 flex items-center gap-1" title={`${activeCount} active contract${activeCount === 1 ? '' : 's'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                    {activeCount === 1 ? 'Active Contract' : `${activeCount} Active`}
                                </span>
                            ) : (
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border bg-slate-50 text-slate-900 border-slate-100" title="No active contracts">
                                    No Active Contract
                                </span>
                            )}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1">View Profile <MoreHorizontal size={14}/></span>
                    </div>
                </div>
            )})}
        </div>
        )}
      </div>

      {/* Add Client Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Add New Client</h3>
                        <p className="text-xs text-slate-900 mt-0.5">Create a new advertising partner record</p>
                    </div>
                    <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
                </div>
                <form onSubmit={handleAddClient} className="p-8 space-y-6">
                    {/* Company Information */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Company Information</p>
                        <div className="space-y-6">
                            <div>
                                <MinimalInput label="Company Name" value={newClient.companyName} onChange={(e: any) => setNewClient({...newClient, companyName: e.target.value})} required />
                            </div>
                            <div>
                                <MinimalInput label="Contact Person" value={newClient.contactPerson} onChange={(e: any) => setNewClient({...newClient, contactPerson: e.target.value})} required />
                                <p className="text-[10px] text-slate-900 mt-2">Primary point of contact for this account</p>
                            </div>
                        </div>
                    </div>

                    {/* Contact Details */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Contact Details</p>
                        <div className="space-y-6">
                            <MinimalInput label="Email Address" type="email" value={newClient.email} onChange={(e: any) => setNewClient({...newClient, email: e.target.value})} />
                            <MinimalInput label="Phone Number" type="tel" value={newClient.phone} onChange={(e: any) => setNewClient({...newClient, phone: e.target.value})} />
                        </div>
                    </div>

                    {/* Billing Preferences */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard size={15} className="text-slate-900" />
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Billing Preferences</p>
                        </div>
                        <MinimalInput
                            label="Billing Day (1–31)"
                            type="number"
                            min={1}
                            max={31}
                            value={newClient.billingDay || ''}
                            onChange={(e: any) => setNewClient({...newClient, billingDay: e.target.value ? Number(e.target.value) : undefined})}
                        />
                        <p className="text-[10px] text-slate-900 mt-3 leading-relaxed">
                            Day of the month invoices are generated. Leave blank to use each contract's start date. E.g. "25" consolidates all invoices for this client to the 25th.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
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
                        <p className="text-xs text-slate-900 mt-0.5">{editingClient.companyName} &bull; {editingClient.status}</p>
                    </div>
                    <button onClick={() => setEditingClient(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900" /></button>
                </div>
                <form onSubmit={handleUpdateClient} className="p-8 space-y-6">
                    {/* Context summary card */}
                    <div className="bg-slate-900 text-white rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-lg">{editingClient.companyName.charAt(0)}</div>
                            <div>
                                <p className="font-bold text-base leading-tight">{editingClient.companyName}</p>
                                <p className="text-xs text-slate-900 mt-0.5">{editingClient.contactPerson}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Email</p>
                                <p className="text-sm text-slate-300 truncate">{editingClient.email || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">Phone</p>
                                <p className="text-sm text-slate-300">{editingClient.phone || '—'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Company Information */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Company Information</p>
                        <div className="space-y-6">
                            <MinimalInput label="Company Name" value={editingClient.companyName} onChange={(e: any) => setEditingClient({...editingClient, companyName: e.target.value})} required />
                            <MinimalInput label="Contact Person" value={editingClient.contactPerson} onChange={(e: any) => setEditingClient({...editingClient, contactPerson: e.target.value})} required />
                        </div>
                    </div>

                    {/* Contact Details */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Contact Details</p>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Email Address" type="email" value={editingClient.email} onChange={(e: any) => setEditingClient({...editingClient, email: e.target.value})} />
                            <MinimalInput label="Phone Number" type="tel" value={editingClient.phone} onChange={(e: any) => setEditingClient({...editingClient, phone: e.target.value})} />
                        </div>
                    </div>

                    {/* Billing Preferences */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard size={15} className="text-slate-900" />
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Billing Preferences</p>
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
                        <p className="text-[10px] text-slate-900 mt-3 leading-relaxed">
                            Setting a fixed billing day (e.g. 25) consolidates all invoices for this client to that day of the month, overriding individual contract start dates.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setEditingClient(null)} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
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
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Client Being Deleted</p>
                        <p className="font-bold text-slate-900">{clientToDelete.companyName}</p>
                        <p className="text-sm text-slate-900 flex items-center gap-2"><User size={13} className="text-slate-900" /> {clientToDelete.contactPerson}</p>
                        <p className="text-sm text-slate-900 flex items-center gap-2"><Mail size={13} className="text-slate-900" /> {clientToDelete.email || '—'}</p>
                        <p className="text-xs text-slate-900 font-mono mt-1">ID: {clientToDelete.id}</p>
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

      {/* CSV Import Result */}
      {importResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full border border-white/20">
                <div className="p-6 border-b border-slate-100 bg-emerald-50 rounded-t-3xl flex items-start gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-emerald-200">
                        <CheckCircle className="text-emerald-600" size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-emerald-900">CSV Import Complete</h3>
                        <p className="text-xs text-emerald-600 mt-0.5 font-medium">Client records were synchronized.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-3 text-center">
                            <p className="text-2xl font-extrabold text-indigo-700">{importResult.updated}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mt-1">Updated</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 text-center">
                            <p className="text-2xl font-extrabold text-emerald-700">{importResult.created}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mt-1">Created</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 text-center">
                            <p className="text-2xl font-extrabold text-slate-900">{importResult.skipped}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mt-1">Skipped</p>
                        </div>
                    </div>
                    {importResult.details.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                            {importResult.details.map((d, i) => (
                                <p key={i} className="text-xs text-amber-700 font-medium flex items-start gap-2">
                                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" /> {d}
                                </p>
                            ))}
                        </div>
                    )}
                    <button onClick={() => setImportResult(null)} className="w-full py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Done</button>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
