import { Billboard, BillboardType, Client, Contract, ContractAmendment, Invoice, Expense, User, PrintingJob, OutsourcedBillboard, AuditLogEntry, CompanyProfile, Task, MaintenanceLog } from '../types';
import { api, isConfigured } from './apiClient';
import { logger } from '../utils/logger';
import { STORAGE_KEYS, RESTORE_GRACE_PERIOD_MS, NEW_ITEM_WINDOW_MS, splitInclusiveVat, VAT_RATE } from './constants';

export const ZIM_TOWNS = [
  "Harare", "Bulawayo", "Mutare", "Gweru", "Kwekwe", 
  "Masvingo", "Chinhoyi", "Marondera", "Kadoma", "Victoria Falls", "Beitbridge", "Zvishavane", "Bindura", "Chitungwiza"
];

// --- Global Subscription System for Real-time Updates ---
const listeners = new Set<() => void>();

export const subscribe = (listener: () => void): () => void => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

const notifyListeners = () => {
    listeners.forEach(listener => listener());
};

const INITIAL_BILLBOARDS: Billboard[] = [];
const INITIAL_CLIENTS: Client[] = [];
const INITIAL_CONTRACTS: Contract[] = [];
const INITIAL_CONTRACT_AMENDMENTS: ContractAmendment[] = [];

// Storage keys are now imported from constants.ts
// Using STORAGE_KEYS from './constants'

const loadFromStorage = <T>(key: string, defaultValue: T | null): T | null => {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) return defaultValue;
        return JSON.parse(stored);
    } catch (e) {
        console.error(`Error loading ${key}`, e);
        return defaultValue;
    }
};

const saveToStorage = (key: string, data: any) => {
    try {
        const serialized = JSON.stringify(data);
        localStorage.setItem(key, serialized);
    } catch (e: any) {
        console.error(`Error saving ${key}`, e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn("Storage Full! Attempting auto-cleanup...");
            try {
                localStorage.removeItem(STORAGE_KEYS.LOGS);
                localStorage.removeItem(STORAGE_KEYS.AUTO_BACKUP);
                localStorage.removeItem(STORAGE_KEYS.CLOUD_MIRROR);
                const serialized = JSON.stringify(data);
                localStorage.setItem(key, serialized);
            } catch (retryError) { console.error("Critical Storage Error"); }
        }
    }
};

window.addEventListener('storage', (event) => {
    if (event.key && event.key.startsWith('db_')) {
        switch(event.key) {
            case STORAGE_KEYS.BILLBOARDS: billboards = loadFromStorage(STORAGE_KEYS.BILLBOARDS, []) || []; break;
            case STORAGE_KEYS.CONTRACTS: contracts = loadFromStorage(STORAGE_KEYS.CONTRACTS, []) || []; break;
            case STORAGE_KEYS.CONTRACT_AMENDMENTS: contractAmendments = loadFromStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, []) || []; break;
            case STORAGE_KEYS.CLIENTS: clients = loadFromStorage(STORAGE_KEYS.CLIENTS, []) || []; break;
            case STORAGE_KEYS.INVOICES: invoices = loadFromStorage(STORAGE_KEYS.INVOICES, []) || []; break;
            case STORAGE_KEYS.EXPENSES: expenses = loadFromStorage(STORAGE_KEYS.EXPENSES, []) || []; break;
            case STORAGE_KEYS.USERS: users = loadFromStorage(STORAGE_KEYS.USERS, []) || []; break;
            case STORAGE_KEYS.TASKS: tasks = loadFromStorage(STORAGE_KEYS.TASKS, []) || []; break;
            case STORAGE_KEYS.MAINTENANCE: maintenanceLogs = loadFromStorage(STORAGE_KEYS.MAINTENANCE, []) || []; break;
            case STORAGE_KEYS.PROFILE: companyProfile = loadFromStorage(STORAGE_KEYS.PROFILE, null) || companyProfile; break;
        }
        notifyListeners();
    }
});

const syncToCloudMirror = () => {
    try {
        const payload = {
            timestamp: new Date().toISOString(),
            data: {
                billboards, contracts, contractAmendments, clients, invoices, expenses, 
                users, outsourcedBillboards, auditLogs, printingJobs, companyLogo, companyProfile, tasks, maintenanceLogs
            }
        };
        localStorage.setItem(STORAGE_KEYS.CLOUD_MIRROR, JSON.stringify(payload));
    } catch (e) {
        console.error("Cloud Mirror Sync Failed", e);
    }
}

interface DeletedItem { table: string; id: string; timestamp: number; }
export let deletedQueue: DeletedItem[] = loadFromStorage(STORAGE_KEYS.DELETED_QUEUE, []) || [];

const queueForDeletion = (table: string, id: string) => {
    if (!deletedQueue.find(i => i.table === table && i.id === id)) {
        deletedQueue.push({ table, id, timestamp: Date.now() });
        saveToStorage(STORAGE_KEYS.DELETED_QUEUE, deletedQueue);
    }
    deleteFromApi(table, id);
};

const deleteFromApi = async (table: string, id: string) => {
    if (!isConfigured()) return;
    try {
        await api.delete(`/api/${table}`, { id });
        deletedQueue = deletedQueue.filter(i => !(i.table === table && i.id === id));
        saveToStorage(STORAGE_KEYS.DELETED_QUEUE, deletedQueue);
    } catch (e) { console.error(`API Delete Error (${table}):`, e); }
};

export const syncToNeon = async (table: string, data: any) => {
    if (!isConfigured()) return;
    try {
        if (data.id) {
            await api.put(`/api/${table}`, data, { id: data.id });
        } else {
            await api.post(`/api/${table}`, data);
        }
    } catch (e) { console.error(`API Sync Error (${table}):`, e); }
};

export const fetchLatestUsers = async () => {
    if (!isConfigured()) return null;
    try {
        const remoteData = await api.get<any[]>('/api/users');
        if (remoteData && remoteData.length > 0) {
            users = remoteData;
            saveToStorage(STORAGE_KEYS.USERS, users);
            console.log(`Users synced from API: ${remoteData.length} total`);
            return users;
        }
    } catch (e) {
        console.error("Failed to fetch users:", e);
    }
    return null;
};

export const triggerFullSync = async () => {
    if (!isConfigured()) return false;
    let hasChanges = false;

    // Flush deletions
    if (deletedQueue.length > 0) {
        const remaining: DeletedItem[] = [];
        for (const item of deletedQueue) {
            try { await api.delete(`/api/${item.table}`, { id: item.id }); }
            catch (e) { remaining.push(item); }
        }
        if (deletedQueue.length !== remaining.length) { deletedQueue = remaining; saveToStorage(STORAGE_KEYS.DELETED_QUEUE, deletedQueue); }
    }

    const tables: { apiPath: string; setter: (d: any[]) => void; storageKey: string }[] = [
        { apiPath: 'billboards',    setter: (d) => { billboards = d; },       storageKey: STORAGE_KEYS.BILLBOARDS },
        { apiPath: 'clients',       setter: (d) => { clients = d; },          storageKey: STORAGE_KEYS.CLIENTS },
        { apiPath: 'contracts',     setter: (d) => { contracts = d; },        storageKey: STORAGE_KEYS.CONTRACTS },
        { apiPath: 'contract-amendments', setter: (d) => { contractAmendments = d; }, storageKey: STORAGE_KEYS.CONTRACT_AMENDMENTS },
        { apiPath: 'invoices',      setter: (d) => { invoices = d; },         storageKey: STORAGE_KEYS.INVOICES },
        { apiPath: 'expenses',      setter: (d) => { expenses = d; },         storageKey: STORAGE_KEYS.EXPENSES },
        { apiPath: 'users',         setter: (d) => { users = d; },            storageKey: STORAGE_KEYS.USERS },
        { apiPath: 'tasks',         setter: (d) => { tasks = d; },            storageKey: STORAGE_KEYS.TASKS },
        { apiPath: 'maintenance',   setter: (d) => { maintenanceLogs = d; },  storageKey: STORAGE_KEYS.MAINTENANCE },
        { apiPath: 'outsourced',    setter: (d) => { outsourcedBillboards = d; }, storageKey: STORAGE_KEYS.OUTSOURCED },
        { apiPath: 'printing-jobs', setter: (d) => { printingJobs = d; },  storageKey: STORAGE_KEYS.PRINTING },
    ];

    try {
        await Promise.all(tables.map(async ({ apiPath, setter, storageKey }) => {
            try {
                const remoteData = await api.get<any[]>(`/api/${apiPath}`);
                if (remoteData) {
                    // Tombstone filter: any id still in the deleted queue for this table
                    // must not be re-hydrated from the server, even if the server-side
                    // DELETE hasn't yet succeeded.
                    const tombstoned = new Set(
                        deletedQueue.filter(i => i.table === apiPath).map(i => i.id)
                    );
                    const filtered = tombstoned.size > 0
                        ? remoteData.filter((row: any) => !tombstoned.has(row?.id))
                        : remoteData;
                    setter(filtered);
                    saveToStorage(storageKey, filtered);
                    hasChanges = true;
                }
            } catch (e) { console.error(`Sync error ${apiPath}:`, e); }
        }));

        // Profile sync
        try {
            const profileData = await api.get('/api/company-profile');
            if (profileData && Object.keys(profileData).length > 0) {
                const { logo, ...rest } = profileData;
                companyProfile = rest;
                saveToStorage(STORAGE_KEYS.PROFILE, companyProfile);
                if (logo) { companyLogo = logo; saveToStorage(STORAGE_KEYS.LOGO, companyLogo); }
                hasChanges = true;
            }
        } catch (e) { console.error('Profile sync error:', e); }

        if (hasChanges) notifyListeners();
        return true;
    } catch (e) { return false; }
};

export const verifyDataIntegrity = async () => {
    if (!isConfigured()) return null;
    const report = { billboards: { local: billboards.length, remote: 0 }, clients: { local: clients.length, remote: 0 }, contracts: { local: contracts.length, remote: 0 }, invoices: { local: invoices.length, remote: 0 }, users: { local: users.length, remote: 0 } };
    try {
        const [b, c, co, i, u] = await Promise.all([
            api.get<any[]>('/api/billboards'), api.get<any[]>('/api/clients'),
            api.get<any[]>('/api/contracts'), api.get<any[]>('/api/invoices'), api.get<any[]>('/api/users'),
        ]);
        report.billboards.remote = b?.length || 0; report.clients.remote = c?.length || 0;
        report.contracts.remote = co?.length || 0; report.invoices.remote = i?.length || 0; report.users.remote = u?.length || 0;
        return report;
    } catch (e) { return null; }
};

if (isConfigured()) { setTimeout(() => triggerFullSync(), 500); }
export const getStorageUsage = () => { let total = 0; for (const key in localStorage) { if (localStorage.hasOwnProperty(key) && key.startsWith('db_')) { total += (localStorage[key].length * 2); } } return (total / 1024).toFixed(2); };

// --- Entity Exports & Initialization ---
export let billboards: Billboard[] = loadFromStorage(STORAGE_KEYS.BILLBOARDS, null) || INITIAL_BILLBOARDS; if (!loadFromStorage(STORAGE_KEYS.BILLBOARDS, null)) saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards);
export let clients: Client[] = loadFromStorage(STORAGE_KEYS.CLIENTS, null) || INITIAL_CLIENTS; if (!loadFromStorage(STORAGE_KEYS.CLIENTS, null)) saveToStorage(STORAGE_KEYS.CLIENTS, clients);
export let contracts: Contract[] = loadFromStorage(STORAGE_KEYS.CONTRACTS, null) || INITIAL_CONTRACTS; if (!loadFromStorage(STORAGE_KEYS.CONTRACTS, null)) saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
export let contractAmendments: ContractAmendment[] = loadFromStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, null) || INITIAL_CONTRACT_AMENDMENTS; if (!loadFromStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, null)) saveToStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, contractAmendments);
export let invoices: Invoice[] = loadFromStorage(STORAGE_KEYS.INVOICES, []) || [];
export let expenses: Expense[] = loadFromStorage(STORAGE_KEYS.EXPENSES, []) || [];
export let auditLogs: AuditLogEntry[] = loadFromStorage(STORAGE_KEYS.LOGS, [{ id: 'log-init', timestamp: new Date().toLocaleString(), action: 'System Init', details: 'System started', user: 'System' }]) || [];
export let outsourcedBillboards: OutsourcedBillboard[] = loadFromStorage(STORAGE_KEYS.OUTSOURCED, []) || [];
export let printingJobs: PrintingJob[] = loadFromStorage(STORAGE_KEYS.PRINTING, []) || [];
export let maintenanceLogs: MaintenanceLog[] = loadFromStorage(STORAGE_KEYS.MAINTENANCE, []) || [];
export let tasks: Task[] = loadFromStorage(STORAGE_KEYS.TASKS, null) || [{ id: 't1', title: 'Site Inspection: Airport Rd', description: 'Verify lighting functionality on Side A.', assignedTo: 'Admin User', priority: 'High', status: 'Todo', dueDate: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString() }, { id: 't2', title: 'Call Delta Beverages', description: 'Follow up on contract renewal for Q3.', assignedTo: 'Manager', priority: 'Medium', status: 'In Progress', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], createdAt: new Date().toISOString() }]; if (!localStorage.getItem(STORAGE_KEYS.TASKS)) saveToStorage(STORAGE_KEYS.TASKS, tasks);
export let users: User[] = loadFromStorage(STORAGE_KEYS.USERS, null) || [];
const updatedUsers = users.map(u => ({ ...u, username: u.username || u.email.split('@')[0], status: u.status || 'Active' })); if (JSON.stringify(updatedUsers) !== JSON.stringify(users)) { users = updatedUsers; saveToStorage(STORAGE_KEYS.USERS, users); }

// Admin users are created through the registration flow or migration scripts.
// No hardcoded credentials are shipped in the frontend bundle.

// Default logo as inline SVG (no external dependency)
const DEFAULT_LOGO_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzMzNzNkYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1zaXplPSIyNCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiPkRyZWFtYm94PC90ZXh0Pjwvc3ZnPg==';

// Fix corrupted logo URLs (remove escaped quotes)
let companyLogo = loadFromStorage(STORAGE_KEYS.LOGO, null);
if (companyLogo && (companyLogo.includes('\\"') || companyLogo.includes('%22') || companyLogo.includes('/%22/'))) {
  console.warn('Fixing corrupted logo URL in localStorage');
  companyLogo = DEFAULT_LOGO_SVG;
  saveToStorage(STORAGE_KEYS.LOGO, companyLogo);
}
if (!companyLogo) companyLogo = DEFAULT_LOGO_SVG;
const DEFAULT_PROFILE: CompanyProfile = {
    name: "Dreambox Advertising",
    vatNumber: "VAT-DBX-001",
    regNumber: "REG-2026/DBX",
    email: "info@dreamboxadvertising.com",
    supportEmail: "info@dreamboxadvertising.com",
    phone: "+263 778 018 909",
    website: "www.dreamboxadvertising.com",
    address: "54 Brooke Village, Borrowdale Brooke",
    city: "Harare",
    country: "Zimbabwe",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    bankBranch: "",
    bankSwift: "",
    paymentTerms: "Payment due within 14 days of invoice date.",
    senderEmail: "",
    senderName: "Dreambox CRM",
    emailSignature: "",
    vatRate: VAT_RATE,
};
let companyProfile: CompanyProfile = loadFromStorage(STORAGE_KEYS.PROFILE, null) || DEFAULT_PROFILE;
// Backfill VAT rate for profiles persisted before the field existed.
if (companyProfile.vatRate === undefined || companyProfile.vatRate === null) {
    companyProfile = { ...companyProfile, vatRate: VAT_RATE };
}

export const getEffectiveVatRate = (): number => {
    const r = companyProfile.vatRate;
    return typeof r === 'number' && r >= 0 ? r : VAT_RATE;
};
let lastBackupDate = loadFromStorage(STORAGE_KEYS.LAST_BACKUP, null) || 'Never'; let lastCloudBackup = loadFromStorage(STORAGE_KEYS.CLOUD_BACKUP, null) || 'Never';

// ... (Other getters/setters/helpers remain same)
export const setCompanyLogo = (url: string) => { companyLogo = url; saveToStorage(STORAGE_KEYS.LOGO, companyLogo); syncToNeon('company-profile', { ...companyProfile, id: 'profile_v1', logo: url }); notifyListeners(); };
export const updateCompanyProfile = (profile: CompanyProfile) => { companyProfile = profile; saveToStorage(STORAGE_KEYS.PROFILE, companyProfile); syncToNeon('company-profile', { ...profile, id: 'profile_v1', logo: companyLogo }); logAction('Settings Update', 'Updated company profile details'); notifyListeners(); };
export const createSystemBackup = () => { const now = new Date().toLocaleString(); lastBackupDate = now; saveToStorage(STORAGE_KEYS.LAST_BACKUP, lastBackupDate); syncToCloudMirror(); return JSON.stringify({ version: '1.9.25', timestamp: new Date().toISOString(), data: { billboards, contracts, contractAmendments, clients, invoices, expenses, users, outsourcedBillboards, auditLogs, printingJobs, companyLogo, companyProfile, tasks, maintenanceLogs } }, null, 2); };
export const simulateCloudSync = async () => { await new Promise(resolve => setTimeout(resolve, 2000)); syncToCloudMirror(); await triggerFullSync(); lastCloudBackup = new Date().toLocaleString(); saveToStorage(STORAGE_KEYS.CLOUD_BACKUP, lastCloudBackup); logAction('System', 'Cloud backup completed successfully'); notifyListeners(); return lastCloudBackup; };
export const getLastCloudBackupDate = () => lastCloudBackup; export const restoreDefaultBillboards = () => 0; export const triggerAutoBackup = () => { saveToStorage(STORAGE_KEYS.AUTO_BACKUP, { timestamp: new Date().toISOString(), data: { billboards, contracts, clients, invoices, expenses, users, outsourcedBillboards, auditLogs, printingJobs, companyLogo, companyProfile, tasks, maintenanceLogs } }); syncToCloudMirror(); return new Date().toLocaleString(); };
export const runAutoBilling = () => {
  const today = new Date();
  const yr = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `${yr}-${mo}`;
  let generated = 0;
  contracts.filter(c => c.status === 'Active' && new Date(c.endDate) >= today).forEach(contract => {
    const alreadyBilled = invoices.some(i => i.contractId === contract.id && String(i.type || '').toLowerCase() === 'invoice' && i.date.startsWith(monthPrefix));
    if (!alreadyBilled) {
      const gross = contract.monthlyRate;
      const { subtotal, vat: vatAmount, total } = contract.hasVat
        ? splitInclusiveVat(gross, getEffectiveVatRate())
        : { subtotal: gross, vat: 0, total: gross };
      const inv: Invoice = {
        id: `INV-AUTO-${contract.id}-${monthPrefix}`,
        contractId: contract.id,
        clientId: contract.clientId,
        date: today.toISOString().split('T')[0],
        items: [{ description: `Monthly Rental — ${mo}/${yr} (Contract ${contract.id})`, amount: subtotal }],
        subtotal,
        vatAmount,
        total,
        status: 'Pending',
        type: 'Invoice'
      };
      addInvoice(inv);
      generated++;
    }
  });
  return generated;
};
export const runMaintenanceCheck = () => 0; export const getAutoBackupStatus = () => { const autoBackup = loadFromStorage(STORAGE_KEYS.AUTO_BACKUP, null); return autoBackup ? new Date(autoBackup.timestamp).toLocaleString() : 'None'; }; export const getLastManualBackupDate = () => lastBackupDate;
export const restoreSystemBackup = async (jsonString: string) => {
  try {
    const backup = JSON.parse(jsonString);
    const d = backup.data;
    if (!d) return { success: false, count: 0 };
    let count = 0;
    if (Array.isArray(d.billboards))        { billboards = d.billboards;               saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards);         count += billboards.length; }
    if (Array.isArray(d.contracts))         { contracts = d.contracts;                 saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);           count += contracts.length; }
    if (Array.isArray(d.contractAmendments)) { contractAmendments = d.contractAmendments; saveToStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, contractAmendments); count += contractAmendments.length; }
    if (Array.isArray(d.clients))           { clients = d.clients;                     saveToStorage(STORAGE_KEYS.CLIENTS, clients);               count += clients.length; }
    if (Array.isArray(d.invoices))          { invoices = d.invoices;                   saveToStorage(STORAGE_KEYS.INVOICES, invoices);             count += invoices.length; }
    if (Array.isArray(d.expenses))          { expenses = d.expenses;                   saveToStorage(STORAGE_KEYS.EXPENSES, expenses);             count += expenses.length; }
    if (Array.isArray(d.users))             { users = d.users;                         saveToStorage(STORAGE_KEYS.USERS, users);                   count += users.length; }
    if (Array.isArray(d.tasks))             { tasks = d.tasks;                         saveToStorage(STORAGE_KEYS.TASKS, tasks);                   count += tasks.length; }
    if (Array.isArray(d.maintenanceLogs))   { maintenanceLogs = d.maintenanceLogs;     saveToStorage(STORAGE_KEYS.MAINTENANCE, maintenanceLogs);   count += maintenanceLogs.length; }
    if (Array.isArray(d.outsourcedBillboards)) { outsourcedBillboards = d.outsourcedBillboards; saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); count += outsourcedBillboards.length; }
    if (Array.isArray(d.auditLogs))         { auditLogs = d.auditLogs;                 saveToStorage(STORAGE_KEYS.LOGS, auditLogs); }
    if (Array.isArray(d.printingJobs))      { printingJobs = d.printingJobs;           saveToStorage(STORAGE_KEYS.PRINTING, printingJobs); }
    if (d.companyLogo)                      { companyLogo = d.companyLogo;             saveToStorage(STORAGE_KEYS.LOGO, companyLogo); }
    if (d.companyProfile)                   { companyProfile = d.companyProfile;       saveToStorage(STORAGE_KEYS.PROFILE, companyProfile); }
    await triggerFullSync();
    logAction('System Restore', `Backup restored from ${backup.timestamp || 'unknown date'} — ${count} records`);
    syncToCloudMirror();
    notifyListeners();
    return { success: true, count };
  } catch (e) {
    console.error('Restore failed:', e);
    return { success: false, count: 0 };
  }
};

export const logAction = (action: string, details: string, userOverride?: string) => { let userName = userOverride || 'System'; try { const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER); if (stored) { const u = JSON.parse(stored); userName = u?.name || u?.email || 'Unknown'; } } catch (_) {} const log: AuditLogEntry = { id: `log-${Date.now()}`, timestamp: new Date().toLocaleString(), action, details, user: userName }; auditLogs = [log, ...auditLogs]; saveToStorage(STORAGE_KEYS.LOGS, auditLogs); notifyListeners(); };

export const resetSystemData = () => {
    localStorage.clear();
    window.location.reload();
};

export const addBillboard = (billboard: Billboard) => { billboards = [...billboards, billboard]; saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); syncToCloudMirror(); syncToNeon('billboards', billboard); logAction('Create Billboard', `Added ${billboard.name} (${billboard.type})`); notifyListeners(); };
export const updateBillboard = (updated: Billboard) => { billboards = billboards.map(b => b.id === updated.id ? updated : b); saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); syncToCloudMirror(); syncToNeon('billboards', updated); logAction('Update Billboard', `Updated details for ${updated.name}`); notifyListeners(); };
export const deleteBillboard = (id: string) => { const target = billboards.find(b => b.id === id); if (target) { billboards = billboards.filter(b => b.id !== id); saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); syncToCloudMirror(); queueForDeletion('billboards', id); logAction('Delete Billboard', `Removed ${target.name} from inventory`); notifyListeners(); } };

export const addContract = (contract: Contract) => { 
    contracts = [...contracts, contract]; 
    saveToStorage(STORAGE_KEYS.CONTRACTS, contracts); 
    syncToNeon('contracts', contract);
    const billboard = billboards.find(b => b.id === contract.billboardId);
    if(billboard) {
        if(billboard.type === BillboardType.Static) {
            if(contract.side === 'A' || contract.details.includes('Side A')) { billboard.sideAStatus = 'Rented'; billboard.sideAClientId = contract.clientId; }
            if(contract.side === 'B' || contract.details.includes('Side B')) { billboard.sideBStatus = 'Rented'; billboard.sideBClientId = contract.clientId; }
            if(contract.side === 'Both') { billboard.sideAStatus = 'Rented'; billboard.sideBStatus = 'Rented'; billboard.sideAClientId = contract.clientId; billboard.sideBClientId = contract.clientId; }
        } else if (billboard.type === BillboardType.LED) {
            billboard.rentedSlots = (billboard.rentedSlots || 0) + 1;
        }
        updateBillboard(billboard); 
    }
    syncToCloudMirror();
    logAction('Create Contract', `New contract for ${contract.billboardId}`); 
    notifyListeners();
};

export const deleteContract = (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if(contract) {
        contracts = contracts.filter(c => c.id !== id);
        saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
        queueForDeletion('contracts', id);

        // Cascade-delete invoices tied to this contract. Receipts and quotations are preserved —
        // receipts represent real payments, and quotations typically don't carry a contractId.
        const linkedInvoices = invoices.filter(i => i.contractId === id && String(i.type || '').toLowerCase() === 'invoice');
        if (linkedInvoices.length > 0) {
            linkedInvoices.forEach(i => queueForDeletion('invoices', i.id));
            invoices = invoices.filter(i => !(i.contractId === id && String(i.type || '').toLowerCase() === 'invoice'));
            saveToStorage(STORAGE_KEYS.INVOICES, invoices);
            logAction('Delete Contract', `Cascade-deleted ${linkedInvoices.length} invoice(s) from contract ${id}`);
        }

        const billboard = billboards.find(b => b.id === contract.billboardId);
        if(billboard) {
            if(billboard.type === BillboardType.Static) {
                if(contract.side === 'A' || contract.details.includes('Side A')) { billboard.sideAStatus = 'Available'; billboard.sideAClientId = undefined; }
                if(contract.side === 'B' || contract.details.includes('Side B')) { billboard.sideBStatus = 'Available'; billboard.sideBClientId = undefined; }
                if(contract.side === 'Both') { billboard.sideAStatus = 'Available'; billboard.sideBStatus = 'Available'; billboard.sideAClientId = undefined; billboard.sideBClientId = undefined; }
            } else if(billboard.type === BillboardType.LED) {
                billboard.rentedSlots = Math.max(0, (billboard.rentedSlots || 0) - 1);
            }
            updateBillboard(billboard); 
        }
        
        syncToCloudMirror();
        logAction('Delete Contract', `Removed contract ${id} and freed up assets`);
        notifyListeners();
    }
};

export const updateContract = (updated: Contract) => {
    const oldContract = contracts.find(c => c.id === updated.id);
    if (!oldContract) {
        console.error('Contract not found for update:', updated.id);
        return;
    }

    console.log('Updating contract:', oldContract.id, '->', updated);

    contracts = contracts.map(c => c.id === updated.id ? updated : c);
    saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
    syncToNeon('contracts', updated);

    Array.from(new Set([oldContract.billboardId, updated.billboardId])).forEach(recalcBillboardAvailability);

    syncToCloudMirror();
    logAction('Update Contract', `Modified contract ${updated.id}`);
    notifyListeners();
};

const recalcBillboardAvailability = (billboardId: string) => {
    const b = billboards.find(x => x.id === billboardId);
    if (!b) return;
    if (b.type === BillboardType.Static) {
        const sideAContract = contracts.find(c => c.billboardId === billboardId && String(c.status || '').toLowerCase() === 'active' && (c.side === 'A' || c.side === 'Both' || (c.details || '').includes('Side A')));
        const sideBContract = contracts.find(c => c.billboardId === billboardId && String(c.status || '').toLowerCase() === 'active' && (c.side === 'B' || c.side === 'Both' || (c.details || '').includes('Side B')));
        const sideAInvoiceHolder = invoices.find(i => String(i.type || '').toLowerCase() === 'invoice' && (i.items || []).some(it => it.billboardId === billboardId && it.side === 'A'));
        const sideBInvoiceHolder = invoices.find(i => String(i.type || '').toLowerCase() === 'invoice' && (i.items || []).some(it => it.billboardId === billboardId && it.side === 'B'));
        if (b.sideAStatus !== 'Maintenance') {
            if (sideAContract) { b.sideAStatus = 'Rented'; b.sideAClientId = sideAContract.clientId; }
            else if (sideAInvoiceHolder) { b.sideAStatus = 'Rented'; b.sideAClientId = sideAInvoiceHolder.clientId; }
            else { b.sideAStatus = 'Available'; b.sideAClientId = undefined; }
        }
        if (b.sideBStatus !== 'Maintenance') {
            if (sideBContract) { b.sideBStatus = 'Rented'; b.sideBClientId = sideBContract.clientId; }
            else if (sideBInvoiceHolder) { b.sideBStatus = 'Rented'; b.sideBClientId = sideBInvoiceHolder.clientId; }
            else { b.sideBStatus = 'Available'; b.sideBClientId = undefined; }
        }
    } else if (b.type === BillboardType.LED) {
        const contractSlots = contracts.filter(c => c.billboardId === billboardId && String(c.status || '').toLowerCase() === 'active').length;
        const invoiceSlots = invoices
            .filter(i => String(i.type || '').toLowerCase() === 'invoice')
            .reduce((acc, i) => acc + (i.items || [])
                .filter(it => it.billboardId === billboardId)
                .reduce((a, it) => a + (it.slots || 0), 0), 0);
        b.rentedSlots = Math.min(b.totalSlots || 0, contractSlots + invoiceSlots);
    }
    billboards = billboards.map(x => x.id === b.id ? b : x);
    saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards);
    syncToNeon('billboards', b);
};

export const addInvoice = (invoice: Invoice) => {
    invoices = [invoice, ...invoices];
    saveToStorage(STORAGE_KEYS.INVOICES, invoices);
    syncToCloudMirror();
    syncToNeon('invoices', invoice);
    if (String(invoice.type || '').toLowerCase() === 'invoice') {
        const touched = Array.from(new Set((invoice.items || []).map(it => it.billboardId).filter((id): id is string => !!id)));
        touched.forEach(recalcBillboardAvailability);
        if (touched.length > 0) logAction('Billboard Availability', `Marked ${touched.length} billboard${touched.length > 1 ? 's' : ''} as rented from Invoice #${invoice.id}`);
    }
    logAction('Create Invoice', `Created ${invoice.type} #${invoice.id} ($${invoice.total})`);
    notifyListeners();
};
export const markInvoiceAsPaid = (id: string) => { invoices = invoices.map(i => i.id === id ? { ...i, status: 'Paid' } : i); saveToStorage(STORAGE_KEYS.INVOICES, invoices); syncToCloudMirror(); const updated = invoices.find(i => i.id === id); if(updated) syncToNeon('invoices', updated); logAction('Payment', `Marked Invoice #${id} as Paid`); notifyListeners(); };

export const updateInvoice = (updated: Invoice) => {
    const old = invoices.find(i => i.id === updated.id);
    if (!old) {
        console.error('Invoice not found for update:', updated.id);
        return;
    }
    invoices = invoices.map(i => i.id === updated.id ? updated : i);
    saveToStorage(STORAGE_KEYS.INVOICES, invoices);
    syncToCloudMirror();
    syncToNeon('invoices', updated);
    logAction('Update Invoice', `Updated ${updated.type} #${updated.id}`);
    notifyListeners();
};

export const deleteInvoice = (id: string) => {
    const target = invoices.find(i => i.id === id);
    if (target) {
        const touchedBillboards = String(target.type || '').toLowerCase() === 'invoice'
            ? Array.from(new Set((target.items || []).map(it => it.billboardId).filter((bid): bid is string => !!bid)))
            : [];
        invoices = invoices.filter(i => i.id !== id);

        // Try to revert invoice status if this was a receipt
        if (target.type === 'Receipt') {
             const desc = target.items?.[0]?.description || '';
             const match = desc.match(/Invoice #([A-Za-z0-9-]+)/);
             if (match && match[1]) {
                 const linkedInvoiceId = match[1];
                 const invoice = invoices.find(i => i.id === linkedInvoiceId);
                 if (invoice) {
                     invoice.status = 'Pending';
                     syncToNeon('invoices', invoice);
                 }
             }
        }

        saveToStorage(STORAGE_KEYS.INVOICES, invoices);
        syncToCloudMirror();
        queueForDeletion('invoices', id);
        if (touchedBillboards.length > 0) {
            touchedBillboards.forEach(recalcBillboardAvailability);
            logAction('Billboard Availability', `Recalculated ${touchedBillboards.length} billboard${touchedBillboards.length > 1 ? 's' : ''} after deleting Invoice #${id}`);
        }
        logAction('Delete Document', `Removed ${target.type} #${id}`);
        notifyListeners();
    }
};

export const addExpense = (expense: Expense) => { expenses = [expense, ...expenses]; saveToStorage(STORAGE_KEYS.EXPENSES, expenses); syncToCloudMirror(); syncToNeon('expenses', expense); logAction('Expense', `Recorded expense: ${expense.description} ($${expense.amount})`); notifyListeners(); };
export const deleteExpense = (id: string) => { const target = expenses.find(e => e.id === id); if (target) { expenses = expenses.filter(e => e.id !== id); saveToStorage(STORAGE_KEYS.EXPENSES, expenses); syncToCloudMirror(); queueForDeletion('expenses', id); logAction('Expense Deleted', `Removed expense: ${target.description} ($${target.amount})`); notifyListeners(); } };
export const addClient = (client: Client) => { clients = [...clients, client]; saveToStorage(STORAGE_KEYS.CLIENTS, clients); syncToCloudMirror(); syncToNeon('clients', client); logAction('Create Client', `Added ${client.companyName}`); notifyListeners(); };
export const updateClient = (updated: Client) => { clients = clients.map(c => c.id === updated.id ? updated : c); saveToStorage(STORAGE_KEYS.CLIENTS, clients); syncToCloudMirror(); syncToNeon('clients', updated); logAction('Update Client', `Updated info for ${updated.companyName}`); notifyListeners(); };
export const deleteClient = (id: string) => { const target = clients.find(c => c.id === id); if (target) { clients = clients.filter(c => c.id !== id); saveToStorage(STORAGE_KEYS.CLIENTS, clients); syncToCloudMirror(); queueForDeletion('clients', id); logAction('Delete Client', `Removed ${target.companyName}`); notifyListeners(); } };
export const addUser = (user: User) => { users = [...users, user]; saveToStorage(STORAGE_KEYS.USERS, users); syncToCloudMirror(); syncToNeon('users', user); logAction('User Mgmt', `Added user ${user.email} (Status: ${user.status})`); notifyListeners(); };
export const updateUser = (updated: User) => { users = users.map(u => u.id === updated.id ? updated : u); saveToStorage(STORAGE_KEYS.USERS, users); syncToCloudMirror(); syncToNeon('users', updated); logAction('User Mgmt', `Updated user ${updated.email}`); notifyListeners(); };
export const deleteUser = (id: string) => { users = users.filter(u => u.id !== id); saveToStorage(STORAGE_KEYS.USERS, users); syncToCloudMirror(); queueForDeletion('users', id); logAction('User Mgmt', `Deleted user ID ${id}`); notifyListeners(); };
export const getPrintingJobs = () => printingJobs || [];
export const addPrintingJob = (job: PrintingJob) => { printingJobs = [job, ...printingJobs]; saveToStorage(STORAGE_KEYS.PRINTING, printingJobs); syncToCloudMirror(); syncToNeon('printing-jobs', job); logAction('Printing', `New print job: ${job.description} ($${job.chargedAmount})`); notifyListeners(); };
export const addOutsourcedBillboard = (b: OutsourcedBillboard) => { outsourcedBillboards = [...outsourcedBillboards, b]; saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); syncToCloudMirror(); syncToNeon('outsourced', b); logAction('Outsourcing', `Added outsourced unit ${b.billboardId}`); notifyListeners(); };
export const updateOutsourcedBillboard = (updated: OutsourcedBillboard) => { outsourcedBillboards = outsourcedBillboards.map(b => b.id === updated.id ? updated : b); saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); syncToCloudMirror(); syncToNeon('outsourced', updated); notifyListeners(); };
export const deleteOutsourcedBillboard = (id: string) => { outsourcedBillboards = outsourcedBillboards.filter(b => b.id !== id); saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); syncToCloudMirror(); queueForDeletion('outsourced', id); notifyListeners(); };
export const addTask = (task: Task) => { tasks = [task, ...tasks]; saveToStorage(STORAGE_KEYS.TASKS, tasks); syncToCloudMirror(); syncToNeon('tasks', task); logAction('Task Created', `New task: ${task.title}`); notifyListeners(); };
export const updateTask = (updated: Task) => { tasks = tasks.map(t => t.id === updated.id ? updated : t); saveToStorage(STORAGE_KEYS.TASKS, tasks); syncToCloudMirror(); syncToNeon('tasks', updated); notifyListeners(); };
export const deleteTask = (id: string) => { const target = tasks.find(t => t.id === id); if(target) { tasks = tasks.filter(t => t.id !== id); saveToStorage(STORAGE_KEYS.TASKS, tasks); syncToCloudMirror(); queueForDeletion('tasks', id); logAction('Task Deleted', `Removed task: ${target.title}`); notifyListeners(); } };
export const addMaintenanceLog = (log: MaintenanceLog) => { maintenanceLogs = [log, ...maintenanceLogs]; saveToStorage(STORAGE_KEYS.MAINTENANCE, maintenanceLogs); syncToNeon('maintenance', log); const billboard = billboards.find(b => b.id === log.billboardId); if (billboard) { billboard.lastMaintenanceDate = log.date; updateBillboard(billboard); } syncToCloudMirror(); logAction('Maintenance', `Logged maintenance for ${billboard?.name || log.billboardId}`); notifyListeners(); };

export const RELEASE_NOTES = [
    {
        version: '1.13.0',
        date: '16/04/2026',
        title: 'Send Contracts, Invoices & Quotes via Email',
        features: [
            'Email: Send contracts directly to clients with full details — billboard, period, rates, and total value.',
            'Email: Send invoices, quotations, and receipts to clients with line-item breakdown and payment info.',
            'Email: Branded dark-theme HTML emails with status badges, document details, and company footer.',
            'Contracts: New "Email" button next to PDF download on every contract card.',
            'Financials: New send button on every invoice, quotation, and receipt row in the documents table.',
            'Payments: New "Email" button on invoice cards to send directly from the payments view.',
            'API: New POST /api/documents/send-email endpoint with auth and document type validation.',
        ]
    },
    {
        version: '1.12.0',
        date: '16/04/2026',
        title: 'Dashboard Expenses & Automated Expense Reports',
        features: [
            'Dashboard: New "Expenses This Month" KPI card with month-over-month change tracking.',
            'Dashboard: Expense breakdown by category with horizontal bar chart showing Maintenance, Printing, Electricity, Labor, and Other.',
            'Dashboard: Recent Expenses panel showing the 5 most recent expense entries.',
            'Cron: Automated expense breakdown email sent to Brian every 3 days with full category breakdown and line items.',
            'Cron: Secure /api/cron/expense-report endpoint with CRON_SECRET authentication.',
            'Cron: Internal scheduler runs automatically on server boot — no external cron service needed.',
        ]
    },
    {
        version: '1.11.0',
        date: '16/04/2026',
        title: 'Security Hardening & User Management Improvements',
        features: [
            'Security: Enforced strong password policy (8+ chars, uppercase, lowercase, number, special character) across all flows.',
            'Security: Password reset form now shows live validation checklist so users know exactly what\'s required.',
            'Security: Sent password reset emails to all active users following security policy upgrade.',
            'Admin: New "Send Password Reset" button in user management table — admins can trigger resets for any user.',
            'Admin: Self-deletion protection — admins can no longer delete their own account.',
            'Admin: Last-admin guard — prevents demoting, deactivating, or deleting the last admin account.',
            'Admin: Email uniqueness now validated when editing a user, with a clear error message.',
            'Admin: UUID validation on all user API endpoints for safer request handling.',
            'Fix: Bulk invite name parsing improved — handles emails like john.doe@, john_doe@, and john-doe@ correctly.',
            'Fix: Removed broken resetUserPassword function, replaced with working admin reset flow.',
        ]
    },
    {
        version: '1.9.29',
        date: '17/03/2026',
        title: 'User Dedup, Audit Logs & CRM Delete Fix',
        features: [
            'Fix: Audit logs now update in real-time without a page reload (notifyListeners added to logAction).',
            'Fix: Duplicate users no longer appear after cloud sync — email-based deduplication applied during merge.',
            'Fix: Deleted CRM opportunities/companies/contacts are now hard-deleted from Neon, preventing them from reappearing after cloud sync.',
            'Fix: CRM company delete now cascades to linked opportunities.',
        ]
    },
    {
        version: '1.9.28',
        date: '17/03/2026',
        title: 'Audit Logs, Billboard Views & Deploy',
        features: [
            'Fix: Audit logs now update in real-time — entries no longer require a page reload to appear.',
            'Billboard List View: Added Share button, rate display, slot count, and clickable image zoom to match Card view.',
            'Billboard Card View: Consistent feature parity with List view across all view modes.',
            'CRM: Removed auto-seeding of sample deals — deleted deals no longer reappear after refresh.',
            'Deploy: Application deployed to Vercel production environment.',
        ]
    },
    {
        version: '1.9.25',
        date: '16/03/2026',
        title: 'New Admin Provision',
        features: [
            'User Mgmt: Added dedicated "Owner" account for Brian Chiduuro.',
            'Sync: New admin account automatically syncs to cloud database on initialization.',
            'Security: Hardcoded credentials are now part of the core "Glued" authentication set.',
        ]
    }
];

export const getBillboards = () => billboards || [];
export const getContracts = () => contracts || [];
export const getContractAmendments = () => contractAmendments || [];
export const getContractAmendmentsForContract = (contractId: string) => contractAmendments.filter(a => a.contractId === contractId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const addContractAmendment = (amendment: ContractAmendment) => {
    contractAmendments = [amendment, ...contractAmendments];
    saveToStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, contractAmendments);
    syncToNeon('contract-amendments', amendment);
    syncToCloudMirror();
    logAction('Contract Amendment', `${amendment.type} on contract ${amendment.contractId}: ${amendment.monthsChanged > 0 ? '+' : ''}${amendment.monthsChanged.toFixed(1)} months, impact $${amendment.financialImpact.toLocaleString()}`);
    notifyListeners();
};

export const deleteContractAmendment = (id: string) => {
    const target = contractAmendments.find(a => a.id === id);
    if (target) {
        contractAmendments = contractAmendments.filter(a => a.id !== id);
        saveToStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, contractAmendments);
        syncToCloudMirror();
        queueForDeletion('contract-amendments', id);
        logAction('Delete Amendment', `Removed amendment ${id} from contract ${target.contractId}`);
        notifyListeners();
    }
};
export const getInvoices = () => invoices || [];
export const getExpenses = () => expenses || [];
export const getAuditLogs = () => auditLogs || [];
export const getUsers = () => users || [];
export const getClients = () => clients || [];
export const getOutsourcedBillboards = () => outsourcedBillboards || [];
export const getTasks = () => tasks || [];
export const getMaintenanceLogs = () => maintenanceLogs || [];
export const getCompanyLogo = () => companyLogo;
export const getCompanyProfile = () => companyProfile;
export const findUser = (identifier: string) => { const term = identifier.toLowerCase().trim(); return users.find(u => u.email.toLowerCase() === term || (u.username && u.username.toLowerCase() === term)); };
export const findUserByEmail = findUser;
export const getPendingInvoices = () => invoices.filter(inv => inv.status === 'Pending' && String(inv.type || '').toLowerCase() === 'invoice');
export const getClientFinancials = (clientId: string) => {
  const clientInvoices = invoices.filter(i => (i.clientId || (i as any).client_id) === clientId);
  const totalBilled = clientInvoices
    .filter(i => String(i.type || '').toLowerCase() === 'invoice')
    .reduce((sum, i) => sum + (Number(i.total) || Number(i.subtotal) || 0), 0);
  const totalPaid = clientInvoices
    .filter(i => String(i.type || '').toLowerCase() === 'receipt')
    .reduce((sum, i) => sum + (Number(i.total) || Number(i.subtotal) || 0), 0);
  return { totalBilled, totalPaid, balance: totalBilled - totalPaid };
};
export const getTransactions = (clientId: string) => invoices.filter(i => {
  const id = i.clientId || (i as any).client_id;
  const t = String(i.type || '').toLowerCase();
  return id === clientId && (t === 'invoice' || t === 'receipt');
}).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
export const getNextBillingDetails = (clientId: string) => { /* ... existing ... */ return null; };
export const getUpcomingBillings = () => {
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);
  const results: { clientName: string; amount: number; date: string; contractId: string; day: number }[] = [];
  contracts.filter(c => c.status === 'Active' && new Date(c.endDate) >= today).forEach(contract => {
    // Billing day = same day-of-month as contract start
    const startDay = new Date(contract.startDate).getDate();
    // Find next billing date from today
    const candidate = new Date(today.getFullYear(), today.getMonth(), startDay);
    if (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
    if (candidate <= in30) {
      const client = clients.find(c => c.id === contract.clientId);
      const monthlyTotal = contract.monthlyRate;
      results.push({
        clientName: client?.companyName || 'Unknown',
        amount: Math.round(monthlyTotal),
        date: candidate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        contractId: contract.id,
        day: startDay,
      });
    }
  });
  return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
export const getExpiringContracts = () => {
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);
  return contracts.filter(c => c.status === 'Active' && new Date(c.endDate) >= today && new Date(c.endDate) <= in30);
};
export const markOverdueInvoices = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  let changed = false;
  invoices = invoices.map(inv => {
    if (inv.status === 'Pending' && String(inv.type || '').toLowerCase() === 'invoice' && new Date(inv.date) < cutoff) {
      changed = true;
      return { ...inv, status: 'Overdue' as const };
    }
    return inv;
  });
  if (changed) { saveToStorage(STORAGE_KEYS.INVOICES, invoices); notifyListeners(); }
};
export const getOverdueInvoices = () => { markOverdueInvoices(); return invoices.filter(i => i.status === 'Overdue' && String(i.type || '').toLowerCase() === 'invoice'); };
export const getSystemAlertCount = () => getExpiringContracts().length + invoices.filter(i => i.status === 'Overdue' && String(i.type || '').toLowerCase() === 'invoice').length;
export const getFinancialTrends = () => {
  // Calculate actual monthly revenue and gross profit from invoices + contract COGS
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = new Date().getMonth();
  
  // Get last 6 months of data
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    const year = new Date().getFullYear() - (currentMonth - i < 0 ? 1 : 0);
    const monthName = months[monthIndex];
    
    // Get invoices for this month
    const monthInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.date);
      return String(inv.type || '').toLowerCase() === 'invoice' &&
             invDate.getMonth() === monthIndex && 
             invDate.getFullYear() === year;
    });
    
    const revenue = monthInvoices.reduce((sum, inv) => sum + inv.total, 0);
    
    // COGS for this month: contracts that started this month (one-time costs incurred)
    const monthContracts = contracts.filter(c => {
      const start = new Date(c.startDate);
      return start.getMonth() === monthIndex && start.getFullYear() === year;
    });
    
    const monthCOGS = monthContracts.reduce((sum, c) => 
      sum + (c.installationCost || 0) + (c.printingCost || 0) + (c.productionCost || 0), 0);
    
    // Add outsourced payouts for this month (actual monthly)
    const outsourcedMonthly = outsourcedBillboards.reduce((sum, b) => sum + (b.monthlyPayout || 0), 0);
    
    // Add operational expenses for this month
    const operationalMonthly = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === monthIndex && d.getFullYear() === year;
    }).reduce((sum, e) => sum + e.amount, 0);
    
    const cogs = monthCOGS + outsourcedMonthly + operationalMonthly;
    const grossProfit = revenue - cogs;
    
    result.push({
      name: monthName,
      revenue: revenue,
      margin: grossProfit, // renamed to margin for backward compatibility with chart
      expenses: cogs,
    });
  }
  
  return result;
};
