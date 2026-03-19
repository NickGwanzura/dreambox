import React, { useState, useRef, useEffect } from 'react';
import { getUsers as getLocalUsers, addUser as addLocalUser, updateUser as updateLocalUser, deleteUser as deleteLocalUser, getAuditLogs, getCompanyLogo, setCompanyLogo, getCompanyProfile, updateCompanyProfile, RELEASE_NOTES, resetSystemData, createSystemBackup, restoreSystemBackup, getLastManualBackupDate, getAutoBackupStatus, getStorageUsage, simulateCloudSync, getLastCloudBackupDate, triggerFullSync, verifyDataIntegrity, syncToSupabase, subscribe } from '../services/mockData';
import { createUser, updateUserData, deleteUserData, approveUser, rejectUser, fetchAllUsers } from '../services/userManagement';
import { generateAppFeaturesPDF, generateUserManualPDF } from '../services/pdfGenerator';
import { Shield, Building, ScrollText, Download, Plus, X, Save, Phone, MapPin, Edit2, Trash2, AlertTriangle, Cloud, Upload, RefreshCw, Clock, HardDrive, Sparkles, Loader2, CheckCircle, FileText, ChevronRight, Server, Wifi, Activity, Lock, Copy, FileCheck, Layers, Cpu, Code2, UserCheck, Users, Database } from 'lucide-react';
import { User as UserType, CompanyProfile } from '../types';
import { DataSyncManager } from './DataSyncManager';

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

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'General' | 'Audit' | 'Data' | 'ReleaseNotes'>('General');
  const [users, setUsers] = useState<UserType[]>(getLocalUsers());
  const [auditLogs, setAuditLogs] = useState(getAuditLogs());
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

  // Pending Approval State
  const [approvalUser, setApprovalUser] = useState<UserType | null>(null);

  // Subscribe to data changes so audit logs update live
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setAuditLogs(getAuditLogs());
    });
    return () => unsubscribe();
  }, []);

  // Load users from Supabase on mount
  useEffect(() => {
      const loadUsers = async () => {
          const { users: supabaseUsers, error } = await fetchAllUsers();
          if (!error && supabaseUsers.length > 0) {
              setUsers(supabaseUsers);
          }
      };
      loadUsers();
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

  const [isUserLoading, setIsUserLoading] = useState(false);

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUser.email || !newUser.firstName || !newUser.lastName) return;

      setIsUserLoading(true);

      const { user, error } = await createUser({
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          role: (newUser.role as 'Admin' | 'Manager' | 'Staff' | 'Sales Agent') || 'Staff',
      });

      if (error) {
          alert(`Error: ${error.message}`);
      } else if (user) {
          // Keep local mockData state in sync (handles audit log + localStorage + triggerFullSync safety)
          addLocalUser({ ...user, status: user.status || 'Active' });
          const { users: freshUsers } = await fetchAllUsers();
          setUsers(freshUsers.length > 0 ? freshUsers : getLocalUsers());
          setIsAddUserModalOpen(false);
          setNewUser({ firstName: '', lastName: '', email: '', username: '', role: 'Staff', status: 'Active' });
      }

      setIsUserLoading(false);
  };

  const handleEditUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (editingUser) {
          const { error } = await updateUserData(editingUser.id, editingUser);
          if (error) {
              alert(`Error: ${error.message}`);
          } else {
              // Keep local mockData state in sync
              updateLocalUser(editingUser);
              const { users: freshUsers } = await fetchAllUsers();
              setUsers(freshUsers.length > 0 ? freshUsers : getLocalUsers());
              setEditingUser(null);
          }
      }
  };

  const handleConfirmDelete = async () => {
      if (userToDelete) {
          const { error } = await deleteUserData(userToDelete.id);
          if (error) {
              alert(`Error: ${error.message}`);
          } else {
              // Remove from local mockData state so triggerFullSync doesn't re-add to Supabase
              deleteLocalUser(userToDelete.id);
              const { users: freshUsers } = await fetchAllUsers();
              setUsers(freshUsers.length > 0 ? freshUsers : getLocalUsers());
              setUserToDelete(null);
          }
      }
  };
  
  const handleApproveUser = async (role: 'Admin' | 'Manager' | 'Staff' | 'Sales Agent') => {
      if (approvalUser) {
          const { error } = await approveUser(approvalUser.id, role);
          if (error) {
              alert(`Error: ${error.message}`);
          } else {
              const { users: freshUsers } = await fetchAllUsers();
              setUsers(freshUsers.length > 0 ? freshUsers : getLocalUsers());
              setApprovalUser(null);
          }
      }
  };

  const handleRejectUser = async () => {
      if (approvalUser) {
          const { error } = await rejectUser(approvalUser.id, false); // Set to Rejected, don't delete
          if (error) {
              alert(`Error: ${error.message}`);
          } else {
              const { users: freshUsers } = await fetchAllUsers();
              setUsers(freshUsers.length > 0 ? freshUsers : getLocalUsers());
              setApprovalUser(null);
          }
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

  const pendingUsers = users.filter(u => u.status === 'Pending');
  const activeUsers = users; // Show ALL users (including pending) so no one is hidden

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">System Settings</h2><p className="text-slate-500 font-medium">Manage organization profile, users, and data</p></div><div className="flex bg-white rounded-full border border-slate-200 p-1 shadow-sm overflow-x-auto max-w-full"><button onClick={() => setActiveTab('General')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'General' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>General</button><button onClick={() => setActiveTab('Data')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Data' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Data & Sync</button><button onClick={() => setActiveTab('Audit')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Audit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Audit Logs</button><button onClick={() => setActiveTab('ReleaseNotes')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ReleaseNotes' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Release Notes</button></div></div>
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
                <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden"><div className="p-6 border-b border-slate-100 flex justify-between items-center"><div className="flex items-center gap-3"><div className="p-2 bg-green-50 rounded-xl"><Shield className="w-6 h-6 text-green-600" /></div><h3 className="text-lg font-bold text-slate-800">All Team Members <span className="text-sm font-normal text-slate-400">({activeUsers.length})</span></h3></div><div className="flex gap-2"><button onClick={async () => { const { users: fresh } = await fetchAllUsers(); setUsers(fresh.length > 0 ? fresh : getLocalUsers()); }} className="flex items-center gap-1 text-xs text-slate-500 font-bold uppercase tracking-wider hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors border border-slate-200"><RefreshCw size={13} /> Refresh</button><button onClick={() => setIsAddUserModalOpen(true)} className="flex items-center gap-1 text-sm text-blue-600 font-bold uppercase tracking-wider hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"><Plus size={16} /> Add User</button></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[500px]"><thead className="bg-slate-50/50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">User</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Email</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Role</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Status</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{activeUsers.map(user => (<tr key={user.id} className="hover:bg-slate-50/50 transition-colors"><td className="px-6 py-4 font-medium text-slate-900"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold border border-slate-300">{user.firstName?.charAt(0) || '?'}</div><div><p className="font-bold text-slate-800">{user.firstName} {user.lastName}</p><p className="text-[10px] text-slate-400 font-mono">{user.username || ''}</p></div></div></td><td className="px-6 py-4 text-xs">{user.email}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${user.role === 'Admin' ? 'bg-purple-50 text-purple-700' : user.role === 'Sales Agent' ? 'bg-emerald-50 text-emerald-700' : user.role === 'Manager' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>{user.role}</span></td><td className="px-6 py-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${user.status === 'Active' ? 'bg-green-50 text-green-700' : user.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>{user.status}</span></td><td className="px-6 py-4 flex justify-end gap-2"><button onClick={() => setEditingUser(user)} className="p-2 text-slate-400 hover:bg-white hover:shadow-sm hover:text-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-100"><Edit2 size={16} /></button><button onClick={() => setUserToDelete(user)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={16} /></button></td></tr>))}{activeUsers.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No users found. Click Refresh to sync from cloud.</td></tr>}</tbody></table></div></div>
            </div>
            <div className="space-y-6"><div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><h3 className="text-lg font-bold text-slate-800 mb-6">Branding & Identity</h3><div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl mb-6 bg-slate-50/50 hover:bg-slate-50 transition-colors"><div className="text-center relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}><div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden shadow-md border-4 border-white group-hover:scale-105 transition-transform"><img src={logoPreview} alt="Logo" className="w-full h-full object-cover"/></div><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><div className="bg-black/50 text-white text-xs font-bold px-2 py-1 rounded">Change</div></div><p className="text-sm font-medium text-slate-600">Company Logo</p><p className="text-xs text-slate-400 mt-1">Click to Upload (Max 1MB)</p><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload}/></div></div><button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"><Upload size={14}/> Upload New Logo</button></div><div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden group"><div className="relative z-10"><h3 className="text-lg font-bold mb-2 flex items-center gap-2"><Cloud size={18}/> System Status</h3><div className="flex items-center gap-2 mb-6"><div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div><span className="text-blue-100 text-sm font-medium">Systems Operational</span></div><div className="space-y-2 text-xs text-blue-200/80 border-t border-white/10 pt-4 font-mono"><p>Version: <span className="text-white">1.9.24</span></p><p>Build: <span className="text-white">Dreambox-Prod</span></p><p>Last Update: {new Date().toLocaleDateString()}</p></div></div><div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity"></div><div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 rounded-full blur-3xl opacity-10"></div></div></div>
        </div>
        )}
        {activeTab === 'Data' && (
            <div className="animate-fade-in">
                <DataSyncManager />
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
                            <MinimalSelect label="Role" value={newUser.role} onChange={(e: any) => setNewUser({...newUser, role: e.target.value})} options={[{value: 'Admin', label: 'Administrator'},{value: 'Manager', label: 'Manager'},{value: 'Staff', label: 'Staff Member'},{value: 'Sales Agent', label: 'Sales Agent (CRM, Billboards, Invoices)'}]} />
                            <button type="submit" disabled={isUserLoading} className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed">{isUserLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {isUserLoading ? 'Creating...' : 'Create User Account'}</button>
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
                            <MinimalSelect label="Role" value={editingUser.role} onChange={(e: any) => setEditingUser({...editingUser, role: e.target.value as any})} options={[{value: 'Admin', label: 'Administrator'},{value: 'Manager', label: 'Manager'},{value: 'Staff', label: 'Staff Member'},{value: 'Sales Agent', label: 'Sales Agent (CRM, Billboards, Invoices)'}]} />
                            <button type="submit" disabled={isUserLoading} className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed">{isUserLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {isUserLoading ? 'Updating...' : 'Update User'}</button>
                        </form>
                    </div>
                </div>
            </div>
        )}

        {/* ... (User Approval Modal) ... */}
        {userToDelete && (
            <div className="fixed inset-0 z-[200] overflow-y-auto">
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setUserToDelete(null)} />
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-white/20">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><AlertTriangle size={20} className="text-red-500" /> Delete User</h3>
                            <button onClick={() => setUserToDelete(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <p className="text-slate-600">Are you sure you want to delete <span className="font-bold text-slate-900">{userToDelete.firstName} {userToDelete.lastName}</span>? This action cannot be undone.</p>
                            <div className="flex gap-3">
                                <button onClick={() => setUserToDelete(null)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                                <button onClick={handleConfirmDelete} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-red-500/20">Delete User</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

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
                                    <button onClick={() => handleApproveUser('Sales Agent')} className="py-3 px-4 bg-white border border-emerald-200 hover:border-emerald-500 hover:text-emerald-700 rounded-xl text-sm font-bold transition-all shadow-sm">Sales Agent <span className="text-xs font-normal text-slate-400 ml-1">(CRM, Billboards, Invoices)</span></button>
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