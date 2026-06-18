import { Billboard, BillboardType, Client, Contract, ContractAmendment, Invoice, Expense, User, PrintingJob, OutsourcedBillboard, AuditLogEntry, CompanyProfile, Task, MaintenanceLog, QuotationEvent, QuoteStatus } from '../types';
import { api, isConfigured } from './apiClient';
import { STORAGE_KEYS, splitInclusiveVat, VAT_RATE } from './constants';
import { exportAllData } from './storage';
import {
  createBackup,
  restoreBackupFromData,
  listBackups,
  formatBackupDate,
  formatBytes,
} from './backupService';

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

// --- Deleted Queue ---
// Tracks IDs that were deleted locally but may not have been deleted from the server yet.
// Prevents deleted records from reappearing after reloadAllFromApi().
const deletedQueueKey = STORAGE_KEYS.DELETED_QUEUE;
let deletedQueue: Set<string> = new Set();

const loadDeletedQueue = (): void => {
    try {
        const raw = localStorage.getItem(deletedQueueKey);
        if (raw) {
            const arr: string[] = JSON.parse(raw);
            deletedQueue = new Set(arr);
        }
    } catch { deletedQueue = new Set(); }
};

const persistDeletedQueue = (): void => {
    try {
        localStorage.setItem(deletedQueueKey, JSON.stringify([...deletedQueue]));
    } catch {}
};

const addToDeletedQueue = (id: string): void => {
    deletedQueue.add(id);
    persistDeletedQueue();
};

const removeFromDeletedQueue = (id: string): void => {
    if (deletedQueue.has(id)) {
        deletedQueue.delete(id);
        persistDeletedQueue();
    }
};

const isInDeletedQueue = (id: string): boolean => deletedQueue.has(id);

// Initialize on module load
loadDeletedQueue();

// --- Entity Exports (in-memory, populated from API on init) ---
export let billboards: Billboard[] = [];
export let clients: Client[] = [];
export let contracts: Contract[] = [];
export let contractAmendments: ContractAmendment[] = [];
export let invoices: Invoice[] = [];
export let expenses: Expense[] = [];
export let auditLogs: AuditLogEntry[] = [];
export let outsourcedBillboards: OutsourcedBillboard[] = [];
export let printingJobs: PrintingJob[] = [];
export let maintenanceLogs: MaintenanceLog[] = [];
export let tasks: Task[] = [];
export let users: User[] = [];
export let quotationEvents: QuotationEvent[] = [];

// --- Company Profile (in-memory, fetched from API) ---
let companyProfile: CompanyProfile | null = null;
let companyLogo: string | null = null;

const DEFAULT_LOGO_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzMzNzNkYyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1zaXplPSIyNCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiPkRyZWFtYm94PC90ZXh0Pjwvc3ZnPg==';
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
    bankName: "CBZ",
    bankAccountName: "Dreambox Advertising",
    bankAccountNumber: "68262016170020",
    bankBranch: "Cripps",
    bankSwift: "",
    paymentTerms: "Payment due within 14 days of invoice date.",
    senderEmail: "",
    senderName: "Dreambox CRM",
    emailSignature: "",
    vatRate: VAT_RATE,
};
companyProfile = DEFAULT_PROFILE;

export const getEffectiveVatRate = (): number => {
    const r = companyProfile?.vatRate;
    return typeof r === 'number' && r >= 0 ? r : VAT_RATE;
};

// --- Initialize from API (callable after login too) ---
export const reloadAllFromApi = async (): Promise<void> => {
    if (!isConfigured()) return;
    try {
        const results = await Promise.allSettled([
            api.get<any[]>('/api/billboards').then(d => { if (d) billboards = d; }),
            api.get<any[]>('/api/clients').then(d => { if (d) clients = d; }),
            api.get<any[]>('/api/contracts').then(d => { if (d) contracts = d; }),
            api.get<any[]>('/api/contract-amendments').then(d => { if (d) contractAmendments = d; }),
            api.get<any[]>('/api/invoices').then(d => {
                if (d) {
                    // Filter out invoices that were locally deleted but may still exist on server
                    invoices = d.filter((inv: any) => !isInDeletedQueue(inv.id));
                }
            }),
            api.get<any[]>('/api/expenses').then(d => { if (d) expenses = d; }),
            api.get<any[]>('/api/users').then(d => { if (d) users = d; }),
            api.get<any[]>('/api/outsourced').then(d => { if (d) outsourcedBillboards = d; }),
            api.get<any[]>('/api/printing-jobs').then(d => { if (d) printingJobs = d; }),
            api.get<any[]>('/api/maintenance').then(d => { if (d) maintenanceLogs = d; }),
            api.get<any[]>('/api/tasks').then(d => { if (d) tasks = d; }),
            api.get<any>('/api/company-profile').then(d => {
                if (d) {
                    // Merge over defaults: profiles saved before new fields existed (e.g. bank
                    // details) come back blank, which would strip payment info from every PDF.
                    const overrides = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== ''));
                    companyProfile = { ...DEFAULT_PROFILE, ...overrides } as CompanyProfile;
                    companyLogo = d.logo || null;
                }
            }),
            api.get<any[]>('/api/audit-logs?limit=500').then(d => {
                if (d) auditLogs = d.map((row: any) => ({
                    ...row,
                    timestamp: row.timestamp || (row.createdAt ? new Date(row.createdAt).toLocaleString() : ''),
                    user: row.user || row.userEmail || row.userId || 'System',
                }));
            }),
        ]);
        const rejected = results.filter(r => r.status === 'rejected');
        if (rejected.length > 0) {
            console.warn(`[mockData] ${rejected.length}/${results.length} API initializations failed`);
        }
        notifyListeners();
    } catch (e) {
        console.error('[mockData] Failed to initialize from API:', e);
    }
};

if (isConfigured()) {
    reloadAllFromApi();
}

// --- Profile Mutations ---
export const setCompanyLogo = async (url: string): Promise<void> => {
    companyLogo = url;
    if (isConfigured() && companyProfile) {
        await api.put('/api/company-profile', { ...companyProfile, id: 'profile_v1', logo: url });
    }
    notifyListeners();
};

export const updateCompanyProfile = async (profile: CompanyProfile): Promise<void> => {
    companyProfile = profile;
    if (isConfigured()) {
        await api.put('/api/company-profile', { ...profile, id: 'profile_v1', logo: companyLogo });
    }
    logAction('Settings Update', 'Updated company profile details');
    notifyListeners();
};

// --- Auto Billing ---
export const runAutoBilling = async (): Promise<number> => {
  const today = new Date();
  const yr = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `${yr}-${mo}`;
  let generated = 0;
  const active = contracts.filter(c => c.status === 'Active' && new Date(c.endDate) >= today);
  for (const contract of active) {
    const alreadyBilled = invoices.some(i => i.contractId === contract.id && String(i.type || '').toLowerCase() === 'invoice' && i.date.startsWith(monthPrefix));
    if (!alreadyBilled) {
      const gross = contract.monthlyRate;
      const { subtotal, vat: vatAmount, total } = contract.hasVat
        ? splitInclusiveVat(gross, getEffectiveVatRate())
        : { subtotal: gross, vat: 0, total: gross };
      // Omit id — server generates UUID, prevents collision on re-run
      const inv = {
        contractId: contract.id,
        clientId: contract.clientId,
        date: today.toISOString().split('T')[0],
        items: [{ description: `Monthly Rental — ${mo}/${yr} (Contract ${contract.id})`, amount: subtotal }],
        subtotal,
        vatAmount,
        total,
        status: 'Pending',
        type: 'Invoice',
      } as Invoice;
      try {
        await addInvoice(inv);
        generated++;
      } catch (e) {
        console.error(`[runAutoBilling] Failed to create invoice for contract ${contract.id}:`, e);
      }
    }
  }
  return generated;
};

// --- Audit Logging ---
export const logAction = (action: string, details: string, userOverride?: string) => {
    let userName = userOverride || 'System';
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (stored) {
            const u = JSON.parse(stored);
            userName = u?.name || u?.email || 'Unknown';
        }
    } catch (_) {}
    const log: AuditLogEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        action,
        details,
        user: userName
    };
    auditLogs = [log, ...auditLogs];
    if (isConfigured()) {
        api.post('/api/audit-logs', log).catch((e) => {
            console.warn('[logAction] Failed to persist audit log:', action, e?.message || e);
        });
    }
    notifyListeners();
};

export const resetSystemData = () => {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    window.location.href = '/login';
};

// --- Billboard CRUD ---
export const addBillboard = async (billboard: Billboard) => {
    // Optimistic: show immediately with local data (including base64 image preview)
    billboards = [...billboards, billboard];
    notifyListeners();

    if (isConfigured()) {
        try {
            const created = await api.post<Billboard>('/api/billboards', billboard);
            // Replace optimistic entry with server version; preserve local imageUrl if server didn't return one
            const merged = { ...created, imageUrl: created.imageUrl || billboard.imageUrl };
            billboards = billboards.map(b => b.id === billboard.id ? merged : b);
        } catch (e) {
            console.error('[addBillboard] API error, using local:', e);
            // Optimistic entry already in place — no action needed
        }
    }
    logAction('Create Billboard', `Added ${billboard.name} (${billboard.type})`);
    notifyListeners();
};

export const updateBillboard = async (updated: Billboard) => {
    const previous = billboards.find(b => b.id === updated.id);
    billboards = billboards.map(b => b.id === updated.id ? updated : b);
    notifyListeners(); // Fire immediately so image appears without waiting for API
    if (isConfigured()) {
        try {
            const saved = await api.put<Billboard>('/api/billboards', updated, { id: updated.id });
            if (saved) {
                // Preserve local imageUrl if the server didn't return one (e.g. R2 not configured)
                const merged = { ...saved, imageUrl: saved.imageUrl || updated.imageUrl };
                billboards = billboards.map(b => b.id === merged.id ? merged : b);
            }
        } catch (e: any) {
            // Roll back optimistic update so UI reflects actual saved state
            if (previous) {
                billboards = billboards.map(b => b.id === updated.id ? previous : b);
                notifyListeners();
            }
            console.error('[updateBillboard] Save failed for billboard:', {
                id: updated.id,
                name: updated.name,
                errorMessage: e?.message,
                errorStatus: e?.status,
                stack: e?.stack,
            });
            throw e;
        }
    }
    logAction('Update Billboard', `Updated details for ${updated.name}`);
    notifyListeners();
};

export const deleteBillboard = async (id: string): Promise<void> => {
    const target = billboards.find(b => b.id === id);
    if (!target) return;
    billboards = billboards.filter(b => b.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/billboards', { id });
        } catch (e) {
            billboards = [target, ...billboards];
            notifyListeners();
            throw e;
        }
    }
    logAction('Delete Billboard', `Removed ${target.name} from inventory`);
    notifyListeners();
};

// --- Contract CRUD ---
export const addContract = async (contract: Contract) => {
    if (isConfigured()) {
        const created = await api.post<Contract>('/api/contracts', contract);
        contracts = [...contracts, created];
        contract = created;
    } else {
        contracts = [...contracts, contract];
    }
    const billboard = billboards.find(b => b.id === contract.billboardId);
    if (billboard) {
        if (billboard.type === BillboardType.Static) {
            if (contract.side === 'A' || contract.details.includes('Side A')) { billboard.sideAStatus = 'Rented'; billboard.sideAClientId = contract.clientId; }
            if (contract.side === 'B' || contract.details.includes('Side B')) { billboard.sideBStatus = 'Rented'; billboard.sideBClientId = contract.clientId; }
            if (contract.side === 'Both') { billboard.sideAStatus = 'Rented'; billboard.sideBStatus = 'Rented'; billboard.sideAClientId = contract.clientId; billboard.sideBClientId = contract.clientId; }
        } else if (billboard.type === BillboardType.LED) {
            billboard.rentedSlots = (billboard.rentedSlots || 0) + 1;
        }
        await updateBillboard(billboard);
    }
    logAction('Create Contract', `New contract for ${contract.billboardId}`);
    notifyListeners();
};

export const updateContract = async (updated: Contract) => {
    const oldContract = contracts.find(c => c.id === updated.id);
    if (!oldContract) {
        console.error('Contract not found for update:', updated.id);
        return;
    }
    contracts = contracts.map(c => c.id === updated.id ? updated : c);
    if (isConfigured()) {
        try {
            await api.put('/api/contracts', updated, { id: updated.id });
        } catch (e) {
            contracts = contracts.map(c => c.id === updated.id ? oldContract : c);
            notifyListeners();
            throw e;
        }
    }
    Array.from(new Set([oldContract.billboardId, updated.billboardId])).forEach(recalcBillboardAvailability);
    logAction('Update Contract', `Modified contract ${updated.id}`);
    notifyListeners();
};

export const deleteContract = async (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if (contract) {
        contracts = contracts.filter(c => c.id !== id);
        if (isConfigured()) {
            try {
                await api.delete('/api/contracts', { id });
            } catch (e) {
                contracts = [contract, ...contracts];
                notifyListeners();
                throw e;
            }
        }

        const linkedInvoices = invoices.filter(i => i.contractId === id && String(i.type || '').toLowerCase() === 'invoice');
        if (linkedInvoices.length > 0) {
            for (const i of linkedInvoices) {
                addToDeletedQueue(i.id);
                if (isConfigured()) {
                    try {
                        await api.delete('/api/invoices', { id: i.id });
                        removeFromDeletedQueue(i.id);
                    } catch (e) {
                        console.error('[deleteContract] API DELETE failed for invoice:', i.id, e);
                    }
                }
            }
            invoices = invoices.filter(i => !(i.contractId === id && String(i.type || '').toLowerCase() === 'invoice'));
            logAction('Delete Contract', `Cascade-deleted ${linkedInvoices.length} invoice(s) from contract ${id}`);
        }

        const linkedAmendments = contractAmendments.filter(a => a.contractId === id);
        if (linkedAmendments.length > 0) {
            for (const a of linkedAmendments) {
                if (isConfigured()) {
                    try {
                        await api.delete('/api/contract-amendments', { id: a.id });
                    } catch (e) {
                        console.error('[deleteContract] API error deleting amendment:', a.id, e);
                    }
                }
            }
            contractAmendments = contractAmendments.filter(a => a.contractId !== id);
            logAction('Delete Contract', `Cascade-deleted ${linkedAmendments.length} amendment(s) from contract ${id}`);
        }

        const billboard = billboards.find(b => b.id === contract.billboardId);
        if (billboard) {
            if (billboard.type === BillboardType.Static) {
                if (contract.side === 'A' || contract.details.includes('Side A')) { billboard.sideAStatus = 'Available'; billboard.sideAClientId = undefined; }
                if (contract.side === 'B' || contract.details.includes('Side B')) { billboard.sideBStatus = 'Available'; billboard.sideBClientId = undefined; }
                if (contract.side === 'Both') { billboard.sideAStatus = 'Available'; billboard.sideBStatus = 'Available'; billboard.sideAClientId = undefined; billboard.sideBClientId = undefined; }
            } else if (billboard.type === BillboardType.LED) {
                billboard.rentedSlots = Math.max(0, (billboard.rentedSlots || 0) - 1);
            }
            updateBillboard(billboard);
        }

        logAction('Delete Contract', `Removed contract ${id} and freed up assets`);
        notifyListeners();
    }
};

export const endContract = async (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) {
        console.error('Contract not found for ending:', id);
        return;
    }

    const endedContract: Contract = {
        ...contract,
        status: 'Expired',
        lastModifiedDate: new Date().toISOString(),
        lastModifiedBy: `${(() => { try { const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER); if (stored) { const u = JSON.parse(stored); return u?.firstName || u?.name || u?.email || 'Current User'; } } catch (_) {} return 'Current User'; })()}`,
    };

    contracts = contracts.map(c => c.id === endedContract.id ? endedContract : c);
    if (isConfigured()) {
        try {
            await api.put('/api/contracts', endedContract, { id: endedContract.id });
        } catch (e) {
            contracts = contracts.map(c => c.id === endedContract.id ? contract : c);
            notifyListeners();
            throw e;
        }
    }

    // Cancel any pending invoices tied to this contract
    const pendingInvoices = invoices.filter(i =>
        i.contractId === id &&
        String(i.type || '').toLowerCase() === 'invoice' &&
        (i.status === 'Pending' || i.status === 'Overdue')
    );
    for (const inv of pendingInvoices) {
        invoices = invoices.filter(i => i.id !== inv.id);
        addToDeletedQueue(inv.id);
        if (isConfigured()) {
            try {
                await api.delete('/api/invoices', { id: inv.id });
                removeFromDeletedQueue(inv.id);
            } catch (e) {
                console.error('[endContract] API DELETE failed for invoice:', inv.id, e);
            }
        }
    }

    recalcBillboardAvailability(contract.billboardId);
    logAction('End Contract', `Ended contract ${id} — marked as Expired, availability freed, ${pendingInvoices.length} pending invoice(s) cancelled`);
    notifyListeners();
};

const auditLogToApi = async (action: string, details: string, tableName?: string, recordId?: string) => {
    if (!isConfigured()) return;
    try {
        await api.post('/api/audit-logs', { action, details, tableName, recordId });
    } catch (e) {
        console.warn('[auditLogToApi] Failed to push audit log to server:', e);
    }
};

export const permanentDeleteContract = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) {
        return { success: false, error: 'Contract not found' };
    }

    // Safety guard: only allow deletion of expired/ended contracts
    if (contract.status !== 'Expired') {
        return { success: false, error: 'Only contracts with status "Expired" can be permanently deleted. End the contract first.' };
    }

    try {
        const linkedInvoiceIds = invoices.filter(i => i.contractId === id).map(i => i.id);
        const linkedAmendmentIds = contractAmendments.filter(a => a.contractId === id).map(a => a.id);

        // If API is configured, push audit log + deletes to Neon FIRST
        if (isConfigured()) {
            await auditLogToApi(
                'Permanent Delete Contract',
                `Permanently deleted contract ${id} (${contract.billboardId}, ${contract.startDate}–${contract.endDate}) and all linked records`,
                'contracts',
                id
            );
            for (const iid of linkedInvoiceIds) {
                addToDeletedQueue(iid);
                try {
                    await api.delete('/api/invoices', { id: iid });
                    removeFromDeletedQueue(iid);
                } catch (e: any) {
                    console.error('[permanentDeleteContract] API error deleting invoice:', iid, e);
                }
            }
            for (const aid of linkedAmendmentIds) {
                try { await api.delete('/api/contract-amendments', { id: aid }); } catch (e: any) { console.error('[permanentDeleteContract] API error:', e); }
            }
            try { await api.delete('/api/contracts', { id }); } catch (e: any) {
                const msg = e?.message || 'API rejected the deletion';
                console.error('[permanentDeleteContract] API error:', msg);
                return { success: false, error: msg };
            }
        }

        // Local audit log BEFORE deletion so the log itself is preserved
        logAction('Permanent Delete Contract', `Permanently deleted contract ${id} (${contract.billboardId}, ${contract.startDate}–${contract.endDate}) and all linked records`);

        // Delete ALL linked invoices locally
        if (linkedInvoiceIds.length > 0) {
            invoices = invoices.filter(i => i.contractId !== id);
        }

        // Delete all linked amendments locally
        if (linkedAmendmentIds.length > 0) {
            contractAmendments = contractAmendments.filter(a => a.contractId !== id);
        }

        // Free billboard availability directly
        const billboard = billboards.find(b => b.id === contract.billboardId);
        if (billboard) {
            if (billboard.type === BillboardType.Static) {
                if (contract.side === 'A' || contract.details.includes('Side A')) { billboard.sideAStatus = 'Available'; billboard.sideAClientId = undefined; }
                if (contract.side === 'B' || contract.details.includes('Side B')) { billboard.sideBStatus = 'Available'; billboard.sideBClientId = undefined; }
                if (contract.side === 'Both') { billboard.sideAStatus = 'Available'; billboard.sideBStatus = 'Available'; billboard.sideAClientId = undefined; billboard.sideBClientId = undefined; }
            } else if (billboard.type === BillboardType.LED) {
                billboard.rentedSlots = Math.max(0, (billboard.rentedSlots || 0) - 1);
            }
            billboards = billboards.map(b => b.id === billboard.id ? billboard : b);
            if (isConfigured()) {
                api.put('/api/billboards', billboard, { id: billboard.id }).catch(e => console.error('[permanentDeleteContract] API error:', e));
            }
        }

        // Delete the contract itself last
        contracts = contracts.filter(c => c.id !== id);

        notifyListeners();
        return { success: true };
    } catch (e: any) {
        console.error('[permanentDeleteContract]', e);
        return { success: false, error: e.message || 'Unknown error during deletion' };
    }
};

export const convertInvoiceType = async (id: string, newType: Invoice['type']) => {
    const invoice = invoices.find(i => i.id === id);
    if (!invoice) {
        console.error('Invoice not found for type conversion:', id);
        return;
    }
    const updated: Invoice = { ...invoice, type: newType };
    invoices = invoices.map(i => i.id === updated.id ? updated : i);
    if (isConfigured()) {
        try {
            await api.put('/api/invoices', updated, { id: updated.id });
        } catch (e) {
            invoices = invoices.map(i => i.id === id ? invoice : i);
            notifyListeners();
            throw e;
        }
    }
    logAction('Convert Invoice Type', `Converted Invoice #${id} to ${newType}`);
    notifyListeners();
};

// --- Quotation Helpers ---

let _quoteCounter = 0;
let _quoteCounterDate = '';

export const getNextQuoteNumber = (): string => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    if (_quoteCounterDate !== today) {
        _quoteCounterDate = today;
        _quoteCounter = 0;
    }
    _quoteCounter++;
    const seq = String(_quoteCounter).padStart(3, '0');
    return `QT-${today}-${seq}`;
};

export const logQuotationEvent = async (invoiceId: string, type: string, details?: string) => {
    let actorEmail = 'System';
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (stored) {
            const u = JSON.parse(stored);
            actorEmail = u?.email || 'Unknown';
        }
    } catch (_) {}
    const event: QuotationEvent = {
        id: `qev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        invoiceId,
        type,
        actorEmail,
        details: details || '',
        createdAt: new Date().toISOString(),
    };
    quotationEvents = [event, ...quotationEvents];
    if (isConfigured()) {
        api.post('/api/quotation-events', event).catch(() => {});
    }
};

export const duplicateQuotation = async (id: string): Promise<Invoice | null> => {
    const original = invoices.find(i => i.id === id && String(i.type).toLowerCase() === 'quotation');
    if (!original) return null;
    // Omit id and quoteNumber — server generates both to prevent collisions
    const { id: _origId, quoteNumber: _origQN, sentAt, sentTo, convertedToInvoiceId, convertedToContractId, convertedAt, ...rest } = original;
    const duplicated: Omit<Invoice, 'id' | 'quoteNumber'> = {
        ...rest,
        date: new Date().toISOString().split('T')[0],
        quoteStatus: QuoteStatus.Draft,
        expiryDate: undefined,
        notes: `Duplicated from ${original.quoteNumber || original.id}`,
    };
    const created = await addInvoice(duplicated as Invoice);
    logQuotationEvent(created.id, 'created', `Duplicated from ${original.quoteNumber || original.id}`);
    logAction('Duplicate Quotation', `Duplicated quotation #${original.id} to #${created.id}`);
    return created;
};

export const convertQuotationToInvoice = async (id: string): Promise<Invoice | null> => {
    const quotation = invoices.find(i => i.id === id && String(i.type).toLowerCase() === 'quotation');
    if (!quotation) return null;
    // Omit id — server generates UUID to prevent collisions
    const { id: _origId, quoteNumber: _origQN, ...quotationRest } = quotation;
    const invoicePayload: Omit<Invoice, 'id'> = {
        ...quotationRest,
        type: 'Invoice',
        status: 'Pending',
        quoteStatus: QuoteStatus.Converted,
        convertedToInvoiceId: undefined,
        convertedAt: new Date().toISOString(),
    };
    const created = await addInvoice(invoicePayload as Invoice);
    // Update original quotation to mark as converted, referencing server-assigned ID
    const updatedQuotation: Invoice = {
        ...quotation,
        quoteStatus: QuoteStatus.Converted,
        convertedToInvoiceId: created.id,
        convertedAt: new Date().toISOString(),
    };
    await updateInvoice(updatedQuotation);
    logQuotationEvent(quotation.id, 'converted', `Converted to Invoice #${created.id}`);
    logAction('Convert Quotation', `Converted quotation #${quotation.id} to invoice #${created.id}`);
    return created;
};

export const markQuotationSent = async (id: string, sentTo?: string) => {
    const quotation = invoices.find(i => i.id === id && String(i.type).toLowerCase() === 'quotation');
    if (!quotation) return;
    const updated: Invoice = {
        ...quotation,
        quoteStatus: QuoteStatus.Sent,
        sentAt: new Date().toISOString(),
        sentTo: sentTo || quotation.sentTo,
    };
    await updateInvoice(updated);
    logQuotationEvent(id, 'sent', sentTo ? `Sent to ${sentTo}` : 'Sent to client');
    logAction('Send Quotation', `Marked quotation #${id} as Sent to ${sentTo || 'client'}`);
};

export const markQuotationStatus = async (id: string, status: Invoice['quoteStatus']) => {
    const quotation = invoices.find(i => i.id === id && String(i.type).toLowerCase() === 'quotation');
    if (!quotation) return;
    const updated: Invoice = { ...quotation, quoteStatus: status };
    await updateInvoice(updated);
    logQuotationEvent(id, status?.toLowerCase() || 'status_changed', `Status changed to ${status}`);
    logAction('Quotation Status', `Marked quotation #${id} as ${status}`);
};

export const getQuotationEvents = (invoiceId: string): QuotationEvent[] => {
    return quotationEvents.filter(e => e.invoiceId === invoiceId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const fetchQuotationEvents = async (invoiceId: string): Promise<QuotationEvent[]> => {
    if (isConfigured()) {
        try {
            const data = await api.get<QuotationEvent[]>(`/api/quotation-events?invoiceId=${invoiceId}`);
            if (data) {
                // Merge with local events
                const localForInvoice = quotationEvents.filter(e => e.invoiceId === invoiceId);
                const merged = [...localForInvoice, ...data.filter(d => !localForInvoice.some(l => l.id === d.id))];
                quotationEvents = [...quotationEvents.filter(e => e.invoiceId !== invoiceId), ...merged];
                return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            }
        } catch (e) {
            console.error('[fetchQuotationEvents] API error:', e);
        }
    }
    return getQuotationEvents(invoiceId);
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
        const contractSlots = contracts
            .filter(c => c.billboardId === billboardId && String(c.status || '').toLowerCase() === 'active')
            .reduce((sum, c) => sum + (c.slotNumber || 1), 0);
        const invoiceSlots = invoices
            .filter(i => String(i.type || '').toLowerCase() === 'invoice')
            .reduce((acc, i) => acc + (i.items || [])
                .filter(it => it.billboardId === billboardId)
                .reduce((a, it) => a + (it.slots || 0), 0), 0);
        b.rentedSlots = Math.min(b.totalSlots || 0, contractSlots + invoiceSlots);
    }
    billboards = billboards.map(x => x.id === b.id ? b : x);
    if (isConfigured()) {
        api.put('/api/billboards', b, { id: b.id }).catch(e => console.error('[recalcBillboardAvailability] API error:', e));
    }
};

// --- Invoice CRUD ---
export const addInvoice = async (invoice: Invoice): Promise<Invoice> => {
    if (isConfigured()) {
        // Let API errors propagate — callers must handle them and surface feedback to the user.
        // Silently falling back to local-only storage creates phantom records that vanish on refresh.
        const created = await api.post<Invoice>('/api/invoices', invoice);
        invoices = [created, ...invoices];
        invoice = created;
    } else {
        invoices = [invoice, ...invoices];
    }
    if (String(invoice.type || '').toLowerCase() === 'invoice') {
        const touched = Array.from(new Set((invoice.items || []).map(it => it.billboardId).filter((id): id is string => !!id)));
        touched.forEach(recalcBillboardAvailability);
        if (touched.length > 0) logAction('Billboard Availability', `Marked ${touched.length} billboard${touched.length > 1 ? 's' : ''} as rented from Invoice #${invoice.id}`);
    }
    if (String(invoice.type || '').toLowerCase() === 'quotation') {
        logQuotationEvent(invoice.id, 'created', `Quotation ${invoice.quoteNumber || invoice.id} created`);
    }
    logAction('Create Invoice', `Created ${invoice.type} #${invoice.id} ($${invoice.total})`);
    notifyListeners();
    return invoice;
};

export const markInvoiceAsPaid = async (id: string) => {
    const previous = invoices.find(i => i.id === id);
    invoices = invoices.map(i => i.id === id ? { ...i, status: 'Paid' } : i);
    const updated = invoices.find(i => i.id === id);
    if (updated && isConfigured()) {
        try {
            await api.put('/api/invoices', updated, { id: updated.id });
        } catch (e) {
            if (previous) invoices = invoices.map(i => i.id === id ? previous : i);
            notifyListeners();
            throw e;
        }
    }
    logAction('Payment', `Marked Invoice #${id} as Paid`);
    notifyListeners();
};

export const updateInvoice = async (updated: Invoice): Promise<void> => {
    const previous = invoices.find(i => i.id === updated.id);
    if (!previous) {
        console.error('Invoice not found for update:', updated.id);
        return;
    }
    // Optimistic local update
    invoices = invoices.map(i => i.id === updated.id ? updated : i);

    const oldBillboards = new Set((previous.items || []).map(it => it.billboardId).filter((bid): bid is string => !!bid));
    const newBillboards = new Set((updated.items || []).map(it => it.billboardId).filter((bid): bid is string => !!bid));
    if (String(previous.type || '').toLowerCase() === 'invoice' || String(updated.type || '').toLowerCase() === 'invoice') {
        const allBillboards = new Set([...oldBillboards, ...newBillboards]);
        allBillboards.forEach(recalcBillboardAvailability);
    }

    if (isConfigured()) {
        try {
            await api.put('/api/invoices', updated, { id: updated.id });
        } catch (e) {
            // Roll back the optimistic update so local state stays consistent with the server
            invoices = invoices.map(i => i.id === updated.id ? previous : i);
            notifyListeners();
            throw e;
        }
    }
    logAction('Update Invoice', `Updated ${updated.type} #${updated.id}`);
    notifyListeners();
};

export const deleteInvoice = async (id: string): Promise<void> => {
    const target = invoices.find(i => i.id === id);
    if (!target) return;

    const touchedBillboards = String(target.type || '').toLowerCase() === 'invoice'
        ? Array.from(new Set((target.items || []).map(it => it.billboardId).filter((bid): bid is string => !!bid)))
        : [];

    // Optimistic local removal
    invoices = invoices.filter(i => i.id !== id);
    addToDeletedQueue(id);

    // Try to revert invoice status if this was a receipt
    if (target.type === 'Receipt') {
        const desc = target.items?.[0]?.description || '';
        const match = desc.match(/Invoice #([A-Za-z0-9-]+)/);
        if (match && match[1]) {
            const linkedInvoiceId = match[1];
            const invoice = invoices.find(i => i.id === linkedInvoiceId);
            if (invoice) {
                invoice.status = 'Pending';
                if (isConfigured()) {
                    try { await api.put('/api/invoices', invoice, { id: invoice.id }); }
                    catch (e) { console.error('[deleteInvoice] API error reverting linked invoice:', e); }
                }
            }
        }
    }

    if (isConfigured()) {
        try {
            await api.delete('/api/invoices', { id });
            removeFromDeletedQueue(id);
        } catch (e: any) {
            // Roll back: restore the record locally so the UI stays consistent
            invoices = [target, ...invoices];
            removeFromDeletedQueue(id);
            notifyListeners();
            throw e;
        }
    }

    if (touchedBillboards.length > 0) {
        touchedBillboards.forEach(recalcBillboardAvailability);
        logAction('Billboard Availability', `Recalculated ${touchedBillboards.length} billboard${touchedBillboards.length > 1 ? 's' : ''} after deleting Invoice #${id}`);
    }
    logAction('Delete Document', `Removed ${target.type} #${id}`);
    notifyListeners();
};

// --- Expense CRUD ---
export const addExpense = async (expense: Expense) => {
    if (isConfigured()) {
        const created = await api.post<Expense>('/api/expenses', expense);
        expenses = [created, ...expenses];
        expense = created;
    } else {
        expenses = [expense, ...expenses];
    }
    logAction('Expense', `Recorded expense: ${expense.description} ($${expense.amount})`);
    notifyListeners();
};

export const deleteExpense = async (id: string): Promise<void> => {
    const target = expenses.find(e => e.id === id);
    if (!target) return;
    expenses = expenses.filter(e => e.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/expenses', { id });
        } catch (e) {
            expenses = [target, ...expenses];
            notifyListeners();
            throw e;
        }
    }
    logAction('Expense Deleted', `Removed expense: ${target.description} ($${target.amount})`);
    notifyListeners();
};

// --- Client CRUD ---
export const addClient = async (client: Client) => {
    if (isConfigured()) {
        const created = await api.post<Client>('/api/clients', client);
        clients = [...clients, created];
        client = created;
    } else {
        clients = [...clients, client];
    }
    logAction('Create Client', `Added ${client.companyName}`);
    notifyListeners();
};

export const updateClient = async (updated: Client) => {
    const previous = clients.find(c => c.id === updated.id);
    clients = clients.map(c => c.id === updated.id ? updated : c);
    if (isConfigured()) {
        try {
            await api.put('/api/clients', updated, { id: updated.id });
        } catch (e) {
            if (previous) clients = clients.map(c => c.id === updated.id ? previous : c);
            notifyListeners();
            throw e;
        }
    }
    logAction('Update Client', `Updated info for ${updated.companyName}`);
    notifyListeners();
};

export const deleteClient = async (id: string): Promise<void> => {
    const target = clients.find(c => c.id === id);
    if (!target) return;
    clients = clients.filter(c => c.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/clients', { id });
        } catch (e) {
            clients = [target, ...clients];
            notifyListeners();
            throw e;
        }
    }
    logAction('Delete Client', `Removed ${target.companyName}`);
    notifyListeners();
};

// --- User CRUD ---
export const addUser = async (user: User) => {
    if (isConfigured()) {
        const created = await api.post<User>('/api/users', user);
        users = [...users, created];
        user = created;
    } else {
        users = [...users, user];
    }
    logAction('User Mgmt', `Added user ${user.email} (Status: ${user.status})`);
    notifyListeners();
};

export const updateUser = async (updated: User) => {
    const previous = users.find(u => u.id === updated.id);
    // Optimistic local update — will be corrected by server response below
    users = users.map(u => u.id === updated.id ? updated : u);
    if (isConfigured()) {
        try {
            // Strip password before sending — API ignores it but no need to transmit
            const { password: _pw, ...payload } = updated as any;
            const saved = await api.put<User>('/api/users', payload, { id: updated.id });
            if (saved) {
                // Replace optimistic copy with server-confirmed record
                users = users.map(u => u.id === saved.id ? saved : u);
                // If this is the currently logged-in user, keep the session in sync
                try {
                    const sessionRaw = localStorage.getItem('billboard_user');
                    if (sessionRaw) {
                        const session = JSON.parse(sessionRaw);
                        if (session.id === saved.id) {
                            localStorage.setItem('billboard_user', JSON.stringify({ ...session, ...saved }));
                            window.dispatchEvent(new CustomEvent('profile-updated', { detail: saved }));
                        }
                    }
                } catch {}
            }
        } catch (e) {
            if (previous) users = users.map(u => u.id === updated.id ? previous : u);
            notifyListeners();
            throw e;
        }
    }
    logAction('User Mgmt', `Updated user ${updated.email}`);
    notifyListeners();
};

export const deleteUser = async (id: string): Promise<void> => {
    const target = users.find(u => u.id === id);
    users = users.filter(u => u.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/users', { id });
        } catch (e) {
            if (target) users = [target, ...users];
            notifyListeners();
            throw e;
        }
    }
    logAction('User Mgmt', `Deleted user ID ${id}`);
    notifyListeners();
};

export const fetchLatestUsers = async (): Promise<User[]> => {
    if (isConfigured()) {
        try {
            const usersData = await api.get<User[]>('/api/users');
            if (usersData) {
                users = usersData;
                return usersData;
            }
        } catch (e) {
            console.error('[fetchLatestUsers] API error:', e);
        }
    }
    return users;
};

// --- Printing Job CRUD ---
export const getPrintingJobs = () => printingJobs || [];

export const addPrintingJob = async (job: PrintingJob) => {
    if (isConfigured()) {
        const created = await api.post<PrintingJob>('/api/printing-jobs', job);
        printingJobs = [created, ...printingJobs];
        job = created;
    } else {
        printingJobs = [job, ...printingJobs];
    }
    logAction('Printing', `New print job: ${job.description} ($${job.chargedAmount})`);
    notifyListeners();
};

// --- Outsourced Billboard CRUD ---
export const addOutsourcedBillboard = async (b: OutsourcedBillboard) => {
    if (isConfigured()) {
        const created = await api.post<OutsourcedBillboard>('/api/outsourced', b);
        outsourcedBillboards = [...outsourcedBillboards, created];
        b = created;
    } else {
        outsourcedBillboards = [...outsourcedBillboards, b];
    }
    logAction('Outsourcing', `Added outsourced unit ${b.billboardId}`);
    notifyListeners();
};

export const updateOutsourcedBillboard = async (updated: OutsourcedBillboard) => {
    const previous = outsourcedBillboards.find(b => b.id === updated.id);
    outsourcedBillboards = outsourcedBillboards.map(b => b.id === updated.id ? updated : b);
    if (isConfigured()) {
        try {
            await api.put('/api/outsourced', updated, { id: updated.id });
        } catch (e) {
            if (previous) outsourcedBillboards = outsourcedBillboards.map(b => b.id === updated.id ? previous : b);
            notifyListeners();
            throw e;
        }
    }
    notifyListeners();
};

export const deleteOutsourcedBillboard = async (id: string): Promise<void> => {
    const target = outsourcedBillboards.find(b => b.id === id);
    outsourcedBillboards = outsourcedBillboards.filter(b => b.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/outsourced', { id });
        } catch (e) {
            if (target) outsourcedBillboards = [target, ...outsourcedBillboards];
            notifyListeners();
            throw e;
        }
    }
    notifyListeners();
};

// --- Task CRUD ---
export const addTask = async (task: Task) => {
    if (isConfigured()) {
        const created = await api.post<Task>('/api/tasks', task);
        tasks = [created, ...tasks];
        task = created;
    } else {
        tasks = [task, ...tasks];
    }
    logAction('Task Created', `New task: ${task.title}`);
    notifyListeners();
};

export const updateTask = async (updated: Task) => {
    const previous = tasks.find(t => t.id === updated.id);
    tasks = tasks.map(t => t.id === updated.id ? updated : t);
    if (isConfigured()) {
        try {
            await api.put('/api/tasks', updated, { id: updated.id });
        } catch (e) {
            if (previous) tasks = tasks.map(t => t.id === updated.id ? previous : t);
            notifyListeners();
            throw e;
        }
    }
    notifyListeners();
};

export const deleteTask = async (id: string): Promise<void> => {
    const target = tasks.find(t => t.id === id);
    if (!target) return;
    tasks = tasks.filter(t => t.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/tasks', { id });
        } catch (e) {
            tasks = [target, ...tasks];
            notifyListeners();
            throw e;
        }
    }
    logAction('Task Deleted', `Removed task: ${target.title}`);
    notifyListeners();
};

// --- Maintenance Log CRUD ---
export const addMaintenanceLog = async (log: MaintenanceLog) => {
    if (isConfigured()) {
        const created = await api.post<MaintenanceLog>('/api/maintenance', log);
        maintenanceLogs = [created, ...maintenanceLogs];
        log = created;
    } else {
        maintenanceLogs = [log, ...maintenanceLogs];
    }
    const billboard = billboards.find(b => b.id === log.billboardId);
    if (billboard) {
        billboard.lastMaintenanceDate = log.date;
        await updateBillboard(billboard);
    }
    logAction('Maintenance', `Logged maintenance for ${billboard?.name || log.billboardId}`);
    notifyListeners();
};

// --- Contract Amendment CRUD ---
export const getContractAmendmentsForContract = (contractId: string) => contractAmendments.filter(a => a.contractId === contractId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const addContractAmendment = async (amendment: ContractAmendment) => {
    if (isConfigured()) {
        const created = await api.post<ContractAmendment>('/api/contract-amendments', amendment);
        contractAmendments = [created, ...contractAmendments];
        amendment = created;
    } else {
        contractAmendments = [amendment, ...contractAmendments];
    }
    logAction('Contract Amendment', `${amendment.type} on contract ${amendment.contractId}: ${amendment.monthsChanged > 0 ? '+' : ''}${amendment.monthsChanged.toFixed(1)} months, impact $${amendment.financialImpact.toLocaleString()}`);
    notifyListeners();
};

export const deleteContractAmendment = async (id: string): Promise<void> => {
    const target = contractAmendments.find(a => a.id === id);
    if (!target) return;
    contractAmendments = contractAmendments.filter(a => a.id !== id);
    if (isConfigured()) {
        try {
            await api.delete('/api/contract-amendments', { id });
        } catch (e) {
            contractAmendments = [target, ...contractAmendments];
            notifyListeners();
            throw e;
        }
    }
    logAction('Delete Amendment', `Removed amendment ${id} from contract ${target.contractId}`);
    notifyListeners();
};

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

// --- Stub functions (previously localStorage-dependent, now no-ops) ---
export const triggerAutoBackup = () => {};
export const runMaintenanceCheck = () => 0;
export const syncToNeon = async () => {};
export const simulateCloudSync = async () => {
  try {
    const backup = await createBackup();
    try { localStorage.setItem('lastCloudBackupDate', backup.createdAt); } catch {}
    return backup.createdAt;
  } catch (e) {
    console.error('[simulateCloudSync] failed', e);
    throw e;
  }
};
export const createSystemBackup = async (): Promise<string> => {
  const result = await exportAllData();
  if (result.error) throw new Error(result.error);
  const json = JSON.stringify(result.data ?? {}, null, 2);
  try { localStorage.setItem('lastManualBackupDate', new Date().toISOString()); } catch {}
  return json;
};
export const restoreSystemBackup = async (data: string): Promise<{ success: boolean; count: number; errors: string[] }> => {
  const parsed = JSON.parse(data);
  const res = await restoreBackupFromData(parsed);
  return { success: res.success, count: res.restored, errors: res.errors };
};
export const getLastManualBackupDate = (): string => {
  try {
    const raw = localStorage.getItem('lastManualBackupDate');
    return raw ? formatBackupDate(raw) : 'N/A';
  } catch { return 'N/A'; }
};
export const getAutoBackupStatus = () => 'Enabled';
export const getStorageUsage = (): string => {
  try {
    const raw = localStorage.getItem('lastManualBackupDate');
    return raw ? 'Cloud (R2)' : '0 B';
  } catch { return '0 B'; }
};
export const getLastCloudBackupDate = (): string => {
  try {
    const raw = localStorage.getItem('lastCloudBackupDate');
    return raw ? formatBackupDate(raw) : 'N/A';
  } catch { return 'N/A'; }
};
export const refreshLastCloudBackupDate = async (): Promise<string> => {
  try {
    const backups = await listBackups();
    if (backups.length > 0) {
      const latest = backups[0].createdAt;
      try { localStorage.setItem('lastCloudBackupDate', latest); } catch {}
      return formatBackupDate(latest);
    }
  } catch (e) {
    console.error('[refreshLastCloudBackupDate] failed', e);
  }
  return getLastCloudBackupDate();
};
export const verifyDataIntegrity = () => null;

// --- Getters ---
export const getBillboards = () => billboards || [];
export const getContracts = () => contracts || [];
export const getContractAmendments = () => contractAmendments || [];
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
export const getHeroImageUrl = (): string | null => (companyProfile as any)?.heroImageUrl || null;
export const getPartnerLogos = (): { name: string; src: string }[] => {
  try {
    const raw = (companyProfile as any)?.partnerLogos;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
};
export const findUser = (identifier: string) => { const term = identifier.toLowerCase().trim(); return users.find(u => u.email.toLowerCase() === term || (u.username && u.username.toLowerCase() === term)); };
export const findUserByEmail = findUser;

// --- Computed Functions ---
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
    const startDay = new Date(contract.startDate).getDate();
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

export const markOverdueInvoices = async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const changed: Invoice[] = [];
  invoices = invoices.map(inv => {
    if (inv.status === 'Pending' && String(inv.type || '').toLowerCase() === 'invoice' && new Date(inv.date) < cutoff) {
      const updated = { ...inv, status: 'Overdue' as const };
      changed.push(updated);
      return updated;
    }
    return inv;
  });
  if (changed.length > 0) {
    if (isConfigured()) {
      for (const inv of changed) {
        try { await api.put('/api/invoices', { status: 'Overdue' }, { id: inv.id }); }
        catch (e) { console.error('[markOverdueInvoices] API error:', e); }
      }
    }
    notifyListeners();
  }
};

export const getOverdueInvoices = () => { markOverdueInvoices(); return invoices.filter(i => i.status === 'Overdue' && String(i.type || '').toLowerCase() === 'invoice'); };

export const getSystemAlertCount = () => getExpiringContracts().length + invoices.filter(i => i.status === 'Overdue' && String(i.type || '').toLowerCase() === 'invoice').length;

export const getFinancialTrends = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = new Date().getMonth();
  
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    const year = new Date().getFullYear() - (currentMonth - i < 0 ? 1 : 0);
    const monthName = months[monthIndex];
    
    const monthInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.date);
      return String(inv.type || '').toLowerCase() === 'invoice' &&
             invDate.getMonth() === monthIndex && 
             invDate.getFullYear() === year;
    });
    
    const revenue = monthInvoices.reduce((sum, inv) => sum + inv.total, 0);
    
    const monthContracts = contracts.filter(c => {
      const start = new Date(c.startDate);
      return start.getMonth() === monthIndex && start.getFullYear() === year;
    });
    
    const monthCOGS = monthContracts.reduce((sum, c) => 
      sum + (c.installationCost || 0) + (c.printingCost || 0) + (c.productionCost || 0), 0);
    
    const outsourcedMonthly = outsourcedBillboards.reduce((sum, b) => sum + (b.monthlyPayout || 0), 0);
    
    const operationalMonthly = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === monthIndex && d.getFullYear() === year;
    }).reduce((sum, e) => sum + e.amount, 0);
    
    const cogs = monthCOGS + outsourcedMonthly + operationalMonthly;
    const grossProfit = revenue - cogs;
    
    result.push({
      name: monthName,
      revenue: revenue,
      margin: grossProfit,
      expenses: cogs,
    });
  }
  
  return result;
};
