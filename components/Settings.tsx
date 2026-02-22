import React, { useState, useRef, useEffect } from 'react';
import { getUsers, addUser, updateUser, deleteUser, getAuditLogs, getCompanyLogo, setCompanyLogo, getCompanyProfile, updateCompanyProfile, RELEASE_NOTES, resetSystemData, createSystemBackup, restoreSystemBackup, getLastManualBackupDate, getAutoBackupStatus, getStorageUsage, simulateCloudSync, getLastCloudBackupDate, triggerFullSync, verifyDataIntegrity, syncToSupabase } from '../services/mockData';
import { generateAppFeaturesPDF, generateUserManualPDF } from '../services/pdfGenerator';
import { Shield, Building, ScrollText, Download, Plus, X, Save, Phone, MapPin, Edit2, Trash2, AlertTriangle, Cloud, Upload, RefreshCw, Database, Clock, HardDrive, Sparkles, Loader2, CheckCircle, FileText, ChevronRight, Server, Wifi, Activity, Lock, Copy, FileCheck, Layers, Cpu, Code2, UserCheck, Users } from 'lucide-react';
import { User as UserType, CompanyProfile } from '../types';
import { isSupabaseConfigured, checkSupabaseConnection } from '../services/supabaseClient';

const MinimalInput = ({ label, value, onChange, type = "text", required = false, placeholder = "", disabled = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value || ''} onChange={onChange} disabled={disabled} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:opacity-60 disabled:cursor-not-allowed" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer">
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

const SUPABASE_SCHEMA_SQL = `
-- Run this in your Supabase SQL Editor to create the required tables

-- 1. Billboards
create table billboards (
  id text primary key,
  name text,
  location text,
  town text,
  type text,
  width numeric,
  height numeric,
  "imageUrl" text,
  coordinates jsonb,
  "sideARate" numeric,
  "sideBRate" numeric,
  "sideAStatus" text,
  "sideBStatus" text,
  "ratePerSlot" numeric,
  "totalSlots" numeric,
  "rentedSlots" numeric,
  "lastMaintenanceDate" text,
  notes text,
  visibility text,
  "dailyTraffic" numeric
);

-- 2. Clients
create table clients (
  id text primary key,
  "companyName" text,
  "contactPerson" text,
  email text,
  phone text,
  status text,
  "billingDay" numeric
);

-- 3. Contracts
create table contracts (
  id text primary key,
  "clientId" text references clients(id),
  "billboardId" text references billboards(id),
  "startDate" text,
  "endDate" text,
  "monthlyRate" numeric,
  "installationCost" numeric,
  "printingCost" numeric,
  "hasVat" boolean,
  "totalContractValue" numeric,
  status text,
  details text,
  "slotNumber" numeric,
  side text
);

-- 4. Invoices
create table invoices (
  id text primary key,
  "contractId" text,
  "clientId" text references clients(id),
  date text,
  items jsonb,
  subtotal numeric,
  "vatAmount" numeric,
  total numeric,
  status text,
  type text,
  "paymentMethod" text,
  "paymentReference" text
);

-- 5. Expenses
create table expenses (
  id text primary key,
  category text,
  description text,
  amount numeric,
  date text,
  reference text
);

-- 6. Users
create table users (
  id text primary key,
  "firstName" text,
  "lastName" text,
  role text,
  email text,
  username text,
  password text,
  status text default 'Active'
);

-- 7. Tasks
create table tasks (
  id text primary key,
  title text,
  description text,
  "assignedTo" text,
  priority text,
  status text,
  "dueDate" text,
  "createdAt" text,
  "relatedBillboardId" text
);

-- 8. Maintenance Logs
create table maintenance_logs (
  id text primary key,
  "billboardId" text references billboards(id),
  date text,
  type text,
  description text,
  cost numeric,
  "performedBy" text,
  "nextDueDate" text,
  notes text
);

-- 9. Company Profile
create table company_profile (
  id text primary key,
  name text,
  "vatNumber" text,
  "regNumber" text,
  email text,
  "supportEmail" text,
  phone text,
  website text,
  address text,
  city text,
  country text,
  logo text
);
`;

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'General' | 'Audit' | 'Data' | 'Database' | 'ReleaseNotes'>('General');
  const [users, setUsers] = useState<UserType[]>(getUsers());
  const auditLogs = getAuditLogs();
  const [logoPreview, setLogoPreview] = useState(getCompanyLogo());
  const [profile, setProfile] = useState<CompanyProfile>(getCompanyProfile());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [newUser, setNewUser] = useState<Partial<UserType>>({ firstName: '', lastName: '', email: '', username: '', role: 'Staff', status: 'Active' });
  const [backupStatus, setBackupStatus] = useState({ manual: getLastManualBackupDate(), auto: getAutoBackupStatus(), storage: getStorageUsage(), cloud: getLastCloudBackupDate() });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<any>(null);

  // Pending Approval State
  const [approvalUser, setApprovalUser] = useState<UserType | null>(null);

  // Database Config State
  const [sbConfig, setSbConfig] = useState({
      url: localStorage.getItem('sb_url') || '',
      key: localStorage.getItem('sb_key') || ''
  });
  const [dbStatus, setDbStatus] = useState<'Disconnected' | 'Connecting' | 'Connected'>('Disconnected');

  useEffect(() => {
      const check = async () => {
          if (isSupabaseConfigured()) {
              setDbStatus('Connecting');
              const connected = await checkSupabaseConnection();
              setDbStatus(connected ? 'Connected' : 'Disconnected');
          }
      };
      check();
  }, []);

  useEffect(() => {
      if (activeTab === 'Data') {
          setBackupStatus({ manual: getLastManualBackupDate(), auto: getAutoBackupStatus(), storage: getStorageUsage(), cloud: getLastCloudBackupDate() });
      }
  }, [activeTab]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => { 
      const file = e.target.files?.[0]; 
      if (file) { 
          if (file.size > 1024 * 1024) { 
              alert("Image size is too large (Max 1MB). Please compress the image.");
              return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64 = reader.result as string;
              setLogoPreview(base64);
              setCompanyLogo(base64);
              alert("Logo updated and saved successfully.");
          };
          reader.readAsDataURL(file);
      } 
  };

  const handleSaveCompanyDetails = () => {
      updateCompanyProfile(profile);
      alert("Company details updated successfully.");
  };

  const handleAddUser = (e: React.FormEvent) => { 
      e.preventDefault(); 
      const user: UserType = { 
          id: (users.length + 1).toString(), 
          firstName: newUser.firstName!, 
          lastName: newUser.lastName!, 
          email: newUser.email!, 
          username: newUser.username || newUser.email!.split('@')[0],
          role: newUser.role as 'Admin' | 'Manager' | 'Staff', 
          password: 'password123',
          status: 'Active'
      }; 
      addUser(user); 
      setUsers(getUsers()); 
      setIsAddUserModalOpen(false); 
      setNewUser({ firstName: '', lastName: '', email: '', username: '', role: 'Staff', status: 'Active' }); 
  };
  
  const handleEditUser = (e: React.FormEvent) => { e.preventDefault(); if (editingUser) { updateUser(editingUser); setUsers(getUsers()); setEditingUser(null); } };
  const handleConfirmDelete = () => { if (userToDelete) { deleteUser(userToDelete.id); setUsers(getUsers()); setUserToDelete(null); } };
  
  const handleApproveUser = (role: 'Admin' | 'Manager' | 'Staff') => {
      if (approvalUser) {
          updateUser({ ...approvalUser, role, status: 'Active' });
          setUsers(getUsers());
          setApprovalUser(null);
      }
  };

  const handleRejectUser = () => {
      if (approvalUser) {
          deleteUser(approvalUser.id); // Or set to 'Rejected' if we want to keep record
          setUsers(getUsers());
          setApprovalUser(null);
      }
  };

  const handleExportAuditLogs = () => { if (auditLogs.length === 0) { alert("No logs to export."); return; } const csvRows = auditLogs.map(log => `${log.id},"${log.timestamp}","${log.user}","${log.action}","${log.details.replace(/"/g, '""')}"`).join("\n"); const blob = new Blob(["ID,Timestamp,User,Action,Details\n" + csvRows], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0,10)}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); };

  const handleDownloadBackup = () => {
    const json = createSystemBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `billboard_suite_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBackupStatus(prev => ({ ...prev, manual: getLastManualBackupDate() }));
  };

  const handleCloudSync = async () => {
      try {
          setIsSyncing(true);
          const timestamp = await simulateCloudSync();
          setBackupStatus(prev => ({ ...prev, cloud: timestamp }));
          alert("Backup successfully synced to Cloud Storage.");
      } catch (error) {
          console.error("Sync error", error);
          alert("Cloud sync failed. Please check your connection.");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setIsRestoring(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            if (event.target?.result) {
                const result = await restoreSystemBackup(event.target.result as string);
                setIsRestoring(false);
                if (result.success) {
                    alert(`System restored successfully!\n\n${result.count} items processed.\nCloud database has been updated to match the backup.`);
                    window.location.reload();
                } else {
                    alert("Restore Failed: The backup file appears empty or invalid.");
                }
            } else {
                setIsRestoring(false);
            }
            // Reset input so the same file can be selected again if needed
            e.target.value = '';
        };
        reader.onerror = () => {
            setIsRestoring(false);
            e.target.value = '';
        }
        reader.readAsText(file);
    }
  };

  const handleConnectSupabase = async () => {
      if (!sbConfig.url || !sbConfig.key) {
          alert("Please enter both URL and API Key.");
          return;
      }
      setDbStatus('Connecting');
      
      localStorage.setItem('sb_url', sbConfig.url);
      localStorage.setItem('sb_key', sbConfig.key);
      
      // Need to reload to pick up the new client config in services/supabaseClient
      window.location.reload();
  };

  const handleSyncNow = async () => {
      setIsSyncing(true);
      const success = await triggerFullSync();
      setIsSyncing(false);
      if(success) alert("Data successfully synchronized with Supabase!");
      else alert("Sync encountered errors. Check console.");
  };

  const handleForceUserSync = async () => {
      if(dbStatus !== 'Connected') return;
      if(!window.confirm("This will overwrite any matching users in the remote database with your local users. Continue?")) return;
      
      setIsSyncing(true);
      try {
          const allUsers = getUsers();
          for(const u of allUsers) {
              await syncToSupabase('users', u);
          }
          setIsSyncing(false);
          alert(`Successfully pushed ${allUsers.length} users to Supabase.`);
      } catch (e) {
          setIsSyncing(false);
          alert("Error pushing users. Check console.");
      }
  };

  const handleVerifyIntegrity = async () => {
      setIsVerifying(true);
      const report = await verifyDataIntegrity();
      setIntegrityReport(report);
      setIsVerifying(false);
  };

  const copySchema = () => {
      navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      alert("SQL Schema copied to clipboard!");
  };

  const pendingUsers = users.filter(u => u.status === 'Pending');
  const activeUsers = users.filter(u => u.status !== 'Pending');

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">System Settings</h2><p className="text-slate-500 font-medium">Manage organization profile, users, and data</p></div><div className="flex bg-white rounded-full border border-slate-200 p-1 shadow-sm overflow-x-auto max-w-full"><button onClick={() => setActiveTab('General')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'General' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>General</button><button onClick={() => setActiveTab('Data')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Data' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Backup</button><button onClick={() => setActiveTab('Database')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Database' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Database</button><button onClick={() => setActiveTab('Audit')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Audit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Audit Logs</button><button onClick={() => setActiveTab('ReleaseNotes')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ReleaseNotes' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Release Notes</button></div></div>
        {activeTab === 'General' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* ... (General Tab Content remains same) ... */}
            <div className="lg:col-span-2 space-y-8">
                {pendingUsers.length > 0 && (
                    <div className="bg-amber-50 p-6 rounded-2xl shadow-sm border border-amber-100 animate-pulse-slow">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-white rounded-xl text-amber-600 shadow-sm"><UserCheck size={20} /></div>
                            <h3 className="text-lg font-bold text-amber-900">Pending Approvals ({pendingUsers.length})</h3>
                        </div>
                        <div className="space-y-3">
                            {pendingUsers.map(user => (
                                <div key={user.id} className="bg-white p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">{user.firstName.charAt(0)}</div>
                                        <div>
                                            <p className="font-bold text-slate-900">{user.firstName} {user.lastName}</p>
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setApprovalUser(user)}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition-colors"
                                    >
                                        Review Request
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"><div className="flex items-center gap-3 mb-8"><div className="p-3 bg-blue-50 rounded-xl"><Building className="w-6 h-6 text-blue-600" /></div><h3 className="text-xl font-bold text-slate-800">Company Profile</h3></div><div className="space-y-8"><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="md:col-span-2"><MinimalInput label="Company Registered Name" value={profile.name} onChange={(e: any) => setProfile({...profile, name: e.target.value})} /></div><MinimalInput label="Tax ID / VAT Number" value={profile.vatNumber} onChange={(e: any) => setProfile({...profile, vatNumber: e.target.value})} /><MinimalInput label="Registration Number" value={profile.regNumber} onChange={(e: any) => setProfile({...profile, regNumber: e.target.value})} /></div><div className="border-t border-slate-50 pt-6"><h4 className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400 tracking-wider mb-6"><Phone size={14} /> Contact Information</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><MinimalInput label="General Email" value={profile.email} onChange={(e: any) => setProfile({...profile, email: e.target.value})} type="email" /><MinimalInput label="Support Email" value={profile.supportEmail} onChange={(e: any) => setProfile({...profile, supportEmail: e.target.value})} type="email" /><MinimalInput label="Phone Number" value={profile.phone} onChange={(e: any) => setProfile({...profile, phone: e.target.value})} type="tel" /><MinimalInput label="Website" value={profile.website} onChange={(e: any) => setProfile({...profile, website: e.target.value})} /></div></div><div className="border-t border-slate-50 pt-6"><h4 className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400 tracking-wider mb-6"><MapPin size={14} /> Location Details</h4><div className="space-y-6"><MinimalInput label="Street Address" value={profile.address} onChange={(e: any) => setProfile({...profile, address: e.target.value})} /><div className="grid grid-cols-2 gap-8"><MinimalInput label="City" value={profile.city} onChange={(e: any) => setProfile({...profile, city: e.target.value})} /><MinimalInput label="Country" value={profile.country} onChange={(e: any) => setProfile({...profile, country: e.target.value})} /></div></div></div></div><div className="mt-8 flex justify-end pt-4 border-t border-slate-50"><button onClick={handleSaveCompanyDetails} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-all hover:scale-105">Save Changes</button></div></div>
                <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden"><div className="p-6 border-b border-slate-100 flex justify-between items-center"><div className="flex items-center gap-3"><div className="p-2 bg-green-50 rounded-xl"><Shield className="w-6 h-6 text-green-600" /></div><h3 className="text-lg font-bold text-slate-800">Active Team</h3></div><button onClick={() => setIsAddUserModalOpen(true)} className="flex items-center gap-1 text-sm text-blue-600 font-bold uppercase tracking-wider hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"><Plus size={16} /> Add User</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[500px]"><thead className="bg-slate-50/50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">User</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Username</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Email</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Role</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{activeUsers.map(user => (<tr key={user.id} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold border border-slate-300">{user.firstName.charAt(0)}</div>{user.firstName} {user.lastName}</td><td className="px-6 py-4 font-mono text-xs">{user.username || '-'}</td><td className="px-6 py-4">{user.email}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${user.role === 'Admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>{user.role}</span></td><td className="px-6 py-4 flex justify-end gap-2"><button onClick={() => setEditingUser(user)} className="p-2 text-slate-400 hover:bg-white hover:shadow-sm hover:text-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-100"><Edit2 size={16} /></button><button onClick={() => setUserToDelete(user)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={16} /></button></td></tr>))}</tbody></table></div></div>
            </div>
            <div className="space-y-6"><div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><h3 className="text-lg font-bold text-slate-800 mb-6">Branding & Identity</h3><div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl mb-6 bg-slate-50/50 hover:bg-slate-50 transition-colors"><div className="text-center relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}><div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden shadow-md border-4 border-white group-hover:scale-105 transition-transform"><img src={logoPreview} alt="Logo" className="w-full h-full object-cover"/></div><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><div className="bg-black/50 text-white text-xs font-bold px-2 py-1 rounded">Change</div></div><p className="text-sm font-medium text-slate-600">Company Logo</p><p className="text-xs text-slate-400 mt-1">Click to Upload (Max 1MB)</p><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload}/></div></div><button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"><Upload size={14}/> Upload New Logo</button></div><div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden group"><div className="relative z-10"><h3 className="text-lg font-bold mb-2 flex items-center gap-2"><Cloud size={18}/> System Status</h3><div className="flex items-center gap-2 mb-6"><div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div><span className="text-blue-100 text-sm font-medium">Systems Operational</span></div><div className="space-y-2 text-xs text-blue-200/80 border-t border-white/10 pt-4 font-mono"><p>Version: <span className="text-white">1.9.24</span></p><p>Build: <span className="text-white">Dreambox-Prod</span></p><p>Last Update: {new Date().toLocaleDateString()}</p></div></div><div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity"></div><div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 rounded-full blur-3xl opacity-10"></div></div></div>
        </div>
        )}
        {activeTab === 'Database' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><Database size={24} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Supabase Connection</h3>
                            <p className="text-xs text-slate-500">Connect to your Supabase project for real-time data.</p>
                        </div>
                    </div>

                    <div className={`p-4 rounded-xl border mb-8 flex items-center gap-4 ${dbStatus === 'Connected' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`p-2 rounded-full ${dbStatus === 'Connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                            {dbStatus === 'Connected' ? <Wifi size={20}/> : <Activity size={20}/>}
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Connection Status</p>
                            <p className={`font-bold ${dbStatus === 'Connected' ? 'text-emerald-700' : 'text-slate-700'}`}>{dbStatus === 'Connecting' ? 'Attempting Connection...' : dbStatus}</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <MinimalInput label="Supabase URL" value={sbConfig.url} onChange={(e: any) => setSbConfig({...sbConfig, url: e.target.value})} placeholder="https://your-project.supabase.co" disabled={dbStatus === 'Connected'} />
                        <div className="relative">
                            <MinimalInput label="Supabase Anon Key" type="password" value={sbConfig.key} onChange={(e: any) => setSbConfig({...sbConfig, key: e.target.value})} disabled={dbStatus === 'Connected'} />
                            <Lock className="absolute right-0 top-3 text-slate-300" size={16}/>
                        </div>

                        <div className="pt-4 border-t border-slate-50 flex gap-4 flex-col sm:flex-row">
                            {dbStatus === 'Connected' ? (
                                <button onClick={handleSyncNow} disabled={isSyncing} className="w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2">
                                    {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>} Force Data Sync
                                </button>
                            ) : (
                                <button onClick={handleConnectSupabase} disabled={dbStatus === 'Connecting'} className="flex-1 py-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold uppercase tracking-wider text-xs transition-colors shadow-lg flex items-center justify-center gap-2">
                                    {dbStatus === 'Connecting' ? <Loader2 size={16} className="animate-spin"/> : <Wifi size={16}/>} 
                                    {dbStatus === 'Connecting' ? 'Connecting...' : 'Connect Supabase'}
                                </button>
                            )}
                        </div>
                        {dbStatus === 'Connected' && (
                            <p className="text-xs text-slate-400 italic text-center">Credentials are locked to prevent accidental disconnection.</p>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {dbStatus === 'Connected' && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                    <FileCheck size={16} className="text-indigo-500"/> Integrity Check
                                </h4>
                                <div className="flex gap-4">
                                    <button onClick={handleForceUserSync} className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                        <Users size={12}/> Force Push Users
                                    </button>
                                    <button onClick={handleVerifyIntegrity} disabled={isVerifying} className="text-xs text-indigo-600 font-bold hover:underline">
                                        {isVerifying ? 'Verifying...' : 'Run Test'}
                                    </button>
                                </div>
                            </div>
                            
                            {integrityReport ? (
                                <div className="space-y-2 text-xs">
                                    {Object.entries(integrityReport).map(([key, data]: [string, any]) => (
                                        <div key={key} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                                            <span className="capitalize font-medium text-slate-600">{key}</span>
                                            <div className="flex gap-4">
                                                <span className="text-slate-400">Local: {data.local}</span>
                                                <span className={`${data.local === data.remote ? 'text-green-600 font-bold' : 'text-amber-600 font-bold'}`}>Remote: {data.remote}</span>
                                            </div>
                                        </div>
                                    ))}
                                    <p className="pt-2 text-[10px] text-slate-400 italic text-center">
                                        Counts should match for full sync status.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 italic text-center py-4">Click "Run Test" to compare local and remote record counts.</p>
                            )}
                        </div>
                    )}

                    <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
                        <div className="relative z-10">
                            <h4 className="text-xl font-bold mb-2">Required SQL Schema</h4>
                            <p className="text-slate-400 text-sm leading-relaxed mb-6">
                                Copy the SQL below and run it in your Supabase SQL Editor to create the necessary tables for Dreambox.
                            </p>
                            <div className="relative group">
                                <pre className="bg-slate-950 p-4 rounded-xl text-[10px] font-mono text-emerald-400 overflow-auto max-h-60 border border-white/10">
                                    {SUPABASE_SCHEMA_SQL}
                                </pre>
                                <button onClick={copySchema} className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors backdrop-blur-md">
                                    <Copy size={14}/>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'Data' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><Database size={24} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Data Integrity</h3>
                            <p className="text-xs text-slate-500">Backup and restore your system data</p>
                        </div>
                    </div>
                    
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Cloud Sync</p>
                                <p className="text-sm font-medium text-slate-700">{backupStatus.cloud}</p>
                            </div>
                            <div className="h-8 w-[1px] bg-slate-200"></div>
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Local Export</p>
                                <p className="text-sm font-medium text-slate-700">{backupStatus.manual}</p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                             <div className="flex items-center gap-2">
                                <HardDrive size={16} className="text-slate-400"/>
                                <span className="text-xs font-bold uppercase text-slate-500">Local Storage</span>
                             </div>
                             <span className="text-xs font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">{backupStatus.storage} KB Used</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                             <h4 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><Cloud size={16}/> Cloud Backup</h4>
                             <p className="text-xs text-slate-500 mb-4">Sync current state to Google Drive.</p>
                             <button onClick={handleCloudSync} disabled={isSyncing} className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
                                 {isSyncing ? <Loader2 size={16} className="animate-spin text-indigo-500"/> : <Upload size={16} className="text-indigo-500"/>} 
                                 {isSyncing ? 'Syncing...' : 'Sync to Google Drive'}
                             </button>
                        </div>

                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                             <h4 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><Download size={16}/> Manual Backup</h4>
                             <p className="text-xs text-slate-500 mb-4">Download a complete JSON snapshot.</p>
                             <button onClick={handleDownloadBackup} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors shadow-lg shadow-indigo-500/30">Download Backup File</button>
                        </div>
                        
                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                             <h4 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><Upload size={16}/> Restore Data</h4>
                             <p className="text-xs text-slate-500 mb-4">Upload a JSON backup file to overwrite current data.</p>
                             <label className={`w-full py-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer flex justify-center items-center gap-2 ${isRestoring ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {isRestoring ? <Loader2 size={16} className="animate-spin"/> : null}
                                 {isRestoring ? 'Restoring & Pushing to Cloud...' : 'Upload & Restore'}
                                 <input type="file" className="hidden" accept=".json" onChange={handleRestoreBackup} disabled={isRestoring} />
                             </label>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-red-50 rounded-xl text-red-600"><AlertTriangle size={24} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Danger Zone</h3>
                            <p className="text-xs text-slate-500">Irreversible system actions</p>
                        </div>
                    </div>
                    <div className="p-6 bg-red-50 rounded-xl border border-red-100 space-y-6">
                        <div>
                            <h4 className="text-sm font-bold text-red-800 mb-1">Factory Reset</h4>
                            <p className="text-xs text-red-600/80 leading-relaxed mb-4">This will permanently delete all local data, including billboards, contracts, clients, and user accounts. Cloud backups will not be affected unless synced.</p>
                            {!isResetConfirmOpen ? (
                                <button onClick={() => setIsResetConfirmOpen(true)} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-red-600/20">Reset System</button>
                            ) : (
                                <div className="space-y-3 animate-fade-in">
                                    <p className="text-xs font-bold text-red-700 text-center">Are you absolutely sure?</p>
                                    <div className="flex gap-3">
                                        <button onClick={() => setIsResetConfirmOpen(false)} className="flex-1 py-2 bg-white text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-50">Cancel</button>
                                        <button onClick={resetSystemData} className="flex-1 py-2 bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-800">Yes, Wipe All</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'Audit' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ScrollText size={20}/> Audit Log</h3>
                        <p className="text-xs text-slate-500">Track system activities and changes</p>
                    </div>
                    <button onClick={handleExportAuditLogs} className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors uppercase tracking-wider">
                        <Download size={14}/> Export CSV
                    </button>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider w-40">Timestamp</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider w-40">User</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider w-40">Action</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {auditLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{log.timestamp}</td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{log.user}</td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200">{log.action}</span></td>
                                    <td className="px-6 py-4 text-slate-600">{log.details}</td>
                                </tr>
                            ))}
                            {auditLogs.length === 0 && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No activity recorded yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
        {activeTab === 'ReleaseNotes' && (
            <div className="space-y-6 animate-fade-in">
                {RELEASE_NOTES.map((note, index) => (
                    <div key={index} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                        {index === 0 && <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest">Latest Release</div>}
                        <div className="flex items-center gap-3 mb-4">
                            <span className="text-2xl font-black text-slate-900 tracking-tight">v{note.version}</span>
                            <span className="text-sm font-medium text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">{note.date}</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-4">{note.title}</h3>
                        <ul className="space-y-3">
                            {note.features.map((feature, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl border border-indigo-100 flex flex-col justify-between">
                        <div>
                            <h4 className="text-lg font-bold text-indigo-900 mb-2">Detailed Documentation</h4>
                            <p className="text-sm text-indigo-700/80 mb-6">Comprehensive guide on all system features and workflows.</p>
                        </div>
                        <button onClick={generateAppFeaturesPDF} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                            <Download size={16}/> Download Feature Guide
                        </button>
                    </div>
                    <div className="bg-gradient-to-br from-slate-50 to-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
                        <div>
                            <h4 className="text-lg font-bold text-slate-900 mb-2">User Manual</h4>
                            <p className="text-sm text-slate-600 mb-6">Quick start guide for new staff members.</p>
                        </div>
                        <button onClick={generateUserManualPDF} className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-2">
                            <Download size={16}/> Download Manual
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isAddUserModalOpen && (
            <div className="fixed inset-0 z-[200] overflow-y-auto">
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsAddUserModalOpen(false)} />
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-xl font-bold text-slate-900">Add New User</h3>
                            <button onClick={() => setIsAddUserModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <form onSubmit={handleAddUser} className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <MinimalInput label="First Name" value={newUser.firstName} onChange={(e: any) => setNewUser({...newUser, firstName: e.target.value})} required />
                                <MinimalInput label="Last Name" value={newUser.lastName} onChange={(e: any) => setNewUser({...newUser, lastName: e.target.value})} required />
                            </div>
                            <MinimalInput label="Email Address" type="email" value={newUser.email} onChange={(e: any) => setNewUser({...newUser, email: e.target.value})} required />
                            <MinimalInput label="Username (Optional)" value={newUser.username} onChange={(e: any) => setNewUser({...newUser, username: e.target.value})} placeholder="Leave blank to use email prefix" />
                            <MinimalSelect label="Role" value={newUser.role} onChange={(e: any) => setNewUser({...newUser, role: e.target.value})} options={[{value: 'Admin', label: 'Administrator'},{value: 'Manager', label: 'Manager'},{value: 'Staff', label: 'Staff Member'}]} />
                            <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all mt-4"><Save size={18} /> Create User Account</button>
                        </form>
                    </div>
                </div>
            </div>
        )}

        {/* ... (Edit User Modal logic - reusing similar structure if needed or assuming existing generic modal pattern) ... */}
        {editingUser && (
            <div className="fixed inset-0 z-[200] overflow-y-auto">
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setEditingUser(null)} />
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-xl font-bold text-slate-900">Edit User</h3>
                            <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <form onSubmit={handleEditUser} className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <MinimalInput label="First Name" value={editingUser.firstName} onChange={(e: any) => setEditingUser({...editingUser, firstName: e.target.value})} required />
                                <MinimalInput label="Last Name" value={editingUser.lastName} onChange={(e: any) => setEditingUser({...editingUser, lastName: e.target.value})} required />
                            </div>
                            <MinimalInput label="Email Address" type="email" value={editingUser.email} onChange={(e: any) => setEditingUser({...editingUser, email: e.target.value})} required />
                            <MinimalInput label="Username" value={editingUser.username} onChange={(e: any) => setEditingUser({...editingUser, username: e.target.value})} />
                            <MinimalSelect label="Role" value={editingUser.role} onChange={(e: any) => setEditingUser({...editingUser, role: e.target.value as any})} options={[{value: 'Admin', label: 'Administrator'},{value: 'Manager', label: 'Manager'},{value: 'Staff', label: 'Staff Member'}]} />
                            <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all mt-4"><Save size={18} /> Update User</button>
                        </form>
                    </div>
                </div>
            </div>
        )}

        {/* ... (User Approval Modal) ... */}
        {approvalUser && (
            <div className="fixed inset-0 z-[200] overflow-y-auto">
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setApprovalUser(null)} />
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-xl font-bold text-slate-900">Approve Account Request</h3>
                            <button onClick={() => setApprovalUser(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                                <div className="w-16 h-16 bg-white rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold text-amber-600 shadow-sm">{approvalUser.firstName.charAt(0)}</div>
                                <h4 className="font-bold text-slate-900">{approvalUser.firstName} {approvalUser.lastName}</h4>
                                <p className="text-xs text-slate-500">{approvalUser.email}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-400 mb-3 text-center">Select Role to Assign</p>
                                <div className="grid grid-cols-1 gap-3">
                                    <button onClick={() => handleApproveUser('Staff')} className="py-3 px-4 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 rounded-xl text-sm font-bold transition-all shadow-sm">Staff Member</button>
                                    <button onClick={() => handleApproveUser('Manager')} className="py-3 px-4 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 rounded-xl text-sm font-bold transition-all shadow-sm">Manager</button>
                                    <button onClick={() => handleApproveUser('Admin')} className="py-3 px-4 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 rounded-xl text-sm font-bold transition-all shadow-sm">Administrator</button>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-slate-100">
                                <button onClick={handleRejectUser} className="w-full py-3 text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors">Reject Request</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </>
  );
};