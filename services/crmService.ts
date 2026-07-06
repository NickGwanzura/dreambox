/**
 * CRM Service Layer
 * Manages CRM data with CSV import/export, opportunity tracking, and outreach logging
 */

import {
  CRMCompany,
  CRMContact,
  CRMOpportunity,
  CRMTouchpoint,
  CRMTask,
  CRMCSVRow,
  CRMEmailThread,
  CRMCallLog,
  CRMPipelineMetrics,
  OpportunityStatus,
  OpportunityStage,
  TouchpointType,
  TouchpointDirection,
  TouchpointOutcome,
  TouchpointSentiment,
  CRMTaskStatus,
  CRMTaskPriority,
  StageHistoryEntry
} from '../types';
import { api, isConfigured } from './apiClient';
import { STORAGE_KEYS, EMAIL_REGEX, PHONE_REGEX } from './constants';
import { logger } from '../utils/logger';
import { sanitizeString, generateId } from '../utils/sanitizers';
import { logAction, notifySyncError } from './mockData';

// ==========================================
// HELPER FUNCTIONS (defined first to avoid hoisting issues)
// ==========================================

const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    logger.error(`Error loading ${key}:`, e);
    return defaultValue;
  }
};

const saveToStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    logger.error(`Error saving ${key}:`, e);
  }
};

// Normalize free-form status text (CSV imports, legacy DB rows) into the
// seven canonical OpportunityStatus values. Unknown values become 'new' —
// an unrecognized status must never crash analytics again.
const STATUS_SYNONYMS: Record<string, OpportunityStatus> = {
  new: 'new', pending: 'new', new_lead: 'new', lead: 'new', open: 'new',
  contacted: 'contacted', contact: 'contacted',
  qualified: 'qualified', qualify: 'qualified',
  proposal: 'proposal', proposed: 'proposal', quote: 'proposal', quoted: 'proposal',
  negotiation: 'negotiation', negotiating: 'negotiation',
  closed_won: 'closed_won', won: 'closed_won',
  closed_lost: 'closed_lost', lost: 'closed_lost',
};

export const normalizeOpportunityStatus = (raw: unknown): OpportunityStatus => {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return STATUS_SYNONYMS[key] || 'new';
};

// Stored/remote rows can carry legacy statuses, null numerics, or a null
// stageHistory — coerce them into the shape the UI code assumes.
const sanitizeOpportunity = (o: any): CRMOpportunity => ({
  ...o,
  status: normalizeOpportunityStatus(o.status),
  numberOfAttempts: typeof o.numberOfAttempts === 'number' ? o.numberOfAttempts : 0,
  daysInCurrentStage: typeof o.daysInCurrentStage === 'number' ? o.daysInCurrentStage : 0,
  stageHistory: Array.isArray(o.stageHistory) ? o.stageHistory : [],
});

// ==========================================
// STATE MANAGEMENT
// ==========================================

interface CRMState {
  companies: CRMCompany[];
  contacts: CRMContact[];
  opportunities: CRMOpportunity[];
  touchpoints: CRMTouchpoint[];
  tasks: CRMTask[];
  emailThreads: CRMEmailThread[];
  callLogs: CRMCallLog[];
}

// Load from localStorage with defaults
const loadCRMState = (): CRMState => ({
  companies: loadFromStorage(STORAGE_KEYS.CRM_COMPANIES, []),
  contacts: loadFromStorage(STORAGE_KEYS.CRM_CONTACTS, []),
  opportunities: loadFromStorage<any[]>(STORAGE_KEYS.CRM_OPPORTUNITIES, []).map(sanitizeOpportunity),
  touchpoints: loadFromStorage(STORAGE_KEYS.CRM_TOUCHPOINTS, []),
  tasks: loadFromStorage(STORAGE_KEYS.CRM_TASKS, []),
  emailThreads: loadFromStorage(STORAGE_KEYS.CRM_EMAIL_THREADS, []),
  callLogs: loadFromStorage(STORAGE_KEYS.CRM_CALL_LOGS, []),
});

let state: CRMState = loadCRMState();

// Subscription system (same pattern as mockData.ts)
const listeners = new Set<() => void>();

export const subscribe = (listener: () => void): () => void => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const notifyListeners = () => {
  listeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      logger.error('CRM listener error:', e);
    }
  });
};

// Map CRMState keys to correct STORAGE_KEYS
const storageKeyMap: Record<keyof CRMState, string> = {
  companies: STORAGE_KEYS.CRM_COMPANIES,
  contacts: STORAGE_KEYS.CRM_CONTACTS,
  opportunities: STORAGE_KEYS.CRM_OPPORTUNITIES,
  touchpoints: STORAGE_KEYS.CRM_TOUCHPOINTS,
  tasks: STORAGE_KEYS.CRM_TASKS,
  emailThreads: STORAGE_KEYS.CRM_EMAIL_THREADS,
  callLogs: STORAGE_KEYS.CRM_CALL_LOGS,
};

// Persist to storage and optionally sync to Neon
const persist = (key: keyof CRMState, data: any[], changedRecord?: any) => {
  const storageKey = storageKeyMap[key];
  if (storageKey) {
    saveToStorage(storageKey, data);
  } else {
    logger.error(`Unknown storage key for: ${key}`);
  }

  state = { ...state, [key]: data };
  notifyListeners();

  // Only sync the changed record, not the entire collection
  if (changedRecord) {
    syncRecordToApi(key, changedRecord);
  }
};

const API_ENDPOINTS: Record<keyof CRMState, string> = {
  companies: 'crm/companies',
  contacts: 'crm/contacts',
  opportunities: 'crm/opportunities',
  touchpoints: 'crm/touchpoints',
  tasks: 'crm/tasks',
  emailThreads: 'crm/email-threads',
  callLogs: 'crm/call-logs',
};

// --- Deleted queue (tombstones) ---
// Records deleted locally whose server DELETE may not have landed yet.
// Prevents the hydration merge from resurrecting them, and lets us retry.
interface CRMDeletedEntry { table: keyof CRMState; id: string; timestamp: number; }
let crmDeletedQueue: CRMDeletedEntry[] = loadFromStorage<CRMDeletedEntry[]>(STORAGE_KEYS.CRM_DELETED_QUEUE, []);

const persistCRMDeletedQueue = () => saveToStorage(STORAGE_KEYS.CRM_DELETED_QUEUE, crmDeletedQueue);

const addCRMTombstone = (table: keyof CRMState, id: string): void => {
  if (!crmDeletedQueue.some(e => e.table === table && e.id === id)) {
    crmDeletedQueue.push({ table, id, timestamp: Date.now() });
    persistCRMDeletedQueue();
  }
};

const removeCRMTombstone = (table: keyof CRMState, id: string): void => {
  const before = crmDeletedQueue.length;
  crmDeletedQueue = crmDeletedQueue.filter(e => !(e.table === table && e.id === id));
  if (crmDeletedQueue.length !== before) persistCRMDeletedQueue();
};

const isCRMTombstoned = (table: keyof CRMState, id: string): boolean =>
  crmDeletedQueue.some(e => e.table === table && e.id === id);

// Tombstone first, then delete server-side; success or 404 clears the tombstone.
const deleteRecordFromApi = (table: keyof CRMState, id: string): void => {
  addCRMTombstone(table, id);
  if (!isConfigured()) return;
  api.delete(`/api/${API_ENDPOINTS[table]}`, { id })
    .then(() => removeCRMTombstone(table, id))
    .catch(e => {
      if (e?.status === 404) removeCRMTombstone(table, id);
      else {
        logger.error(`CRM delete failed for ${table}/${id}, tombstone retained:`, e);
        notifySyncError('CRM record deleted locally — server removal failed and will retry on next reload.');
      }
    });
};

const flushCRMDeletedQueue = async (): Promise<void> => {
  for (const entry of [...crmDeletedQueue]) {
    try {
      await api.delete(`/api/${API_ENDPOINTS[entry.table]}`, { id: entry.id });
      removeCRMTombstone(entry.table, entry.id);
    } catch (e: any) {
      if (e?.status === 404) removeCRMTombstone(entry.table, entry.id);
      else logger.warn(`CRM tombstone retry failed for ${entry.table}/${entry.id}:`, e?.message);
    }
  }
};

const syncRecordToApi = async (stateKey: string, record: any) => {
  const endpoint = API_ENDPOINTS[stateKey as keyof CRMState];
  if (!endpoint) return;
  try {
    if (record.id) {
      await api.put(`/api/${endpoint}`, record, { id: record.id });
    } else {
      await api.post(`/api/${endpoint}`, record);
    }
  } catch (e) {
    logger.error(`API sync error for ${endpoint}:`, e);
    notifySyncError('CRM change saved locally — server sync failed and will retry on next reload.');
  }
};

// --- Initialize from API (callable after login too) ---
// Remote is the source of truth; local-only records (e.g. created while
// offline or while a sync failed) are preserved rather than dropped.
export const reloadCRMFromApi = async (): Promise<void> => {
  if (!isConfigured()) return;

  // Retry pending remote deletes first so the merge below doesn't race them
  await flushCRMDeletedQueue();

  // Remote wins for matching ids; tombstoned records stay dead; records that
  // exist only locally (created offline / failed sync) are kept and re-pushed.
  const mergeRemoteWithLocal = <T extends { id: string }>(
    key: keyof CRMState, remote: T[], local: T[]
  ): { merged: T[]; localOnly: T[] } => {
    const remoteIds = new Set(remote.map(r => r.id));
    const localOnly = local.filter(r => r.id && !remoteIds.has(r.id) && !isCRMTombstoned(key, r.id));
    return {
      merged: [...remote.filter(r => !isCRMTombstoned(key, r.id)), ...localOnly],
      localOnly,
    };
  };

  const keys = Object.keys(API_ENDPOINTS) as (keyof CRMState)[];
  const results = await Promise.allSettled(
    keys.map(async key => {
      let data = await api.get<any[]>(`/api/${API_ENDPOINTS[key]}`);
      if (Array.isArray(data)) {
        if (key === 'opportunities') data = data.map(sanitizeOpportunity);
        const { merged, localOnly } = mergeRemoteWithLocal(key, data, state[key] as any[]);
        // Push records the server doesn't have, sequentially, best-effort
        for (const record of localOnly) {
          await syncRecordToApi(key, record);
        }
        return { key, data: merged };
      }
      return null;
    })
  );

  let changed = false;
  const next = { ...state };
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      next[result.value.key] = result.value.data as any;
      changed = true;
    }
  });

  const rejected = results.filter(r => r.status === 'rejected');
  if (rejected.length > 0) {
    logger.warn(`CRM: ${rejected.length}/${results.length} API loads failed`);
  }

  if (changed) {
    state = next;
    keys.forEach(key => saveToStorage(storageKeyMap[key], state[key]));
    notifyListeners();
  }
};

if (isConfigured()) {
  reloadCRMFromApi();
}

// ==========================================
// COMPANY OPERATIONS
// ==========================================

export const getCRMCompanies = (): CRMCompany[] => [...state.companies];

export const getCRMCompanyById = (id: string): CRMCompany | undefined => 
  state.companies.find(c => c.id === id);

export const findCompanyByName = (name: string): CRMCompany | undefined =>
  state.companies.find(c => 
    c.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

export const addCRMCompany = (company: Omit<CRMCompany, 'id' | 'createdAt' | 'updatedAt'>): CRMCompany => {
  const newCompany: CRMCompany = {
    ...company,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  const updated = [...state.companies, newCompany];
  persist('companies', updated, newCompany);
  logger.info('CRM Company added:', newCompany.name);
  logAction('CRM: Company Added', `Added company "${newCompany.name}"`);

  return newCompany;
};

export const updateCRMCompany = (company: CRMCompany): void => {
  const changed = { ...company, updatedAt: new Date().toISOString() };
  const updated = state.companies.map(c => c.id === company.id ? changed : c);
  persist('companies', updated, changed);
};

export const deleteCRMCompany = (id: string): void => {
  const target = state.companies.find(c => c.id === id);
  const contactsToDelete = state.contacts.filter(c => c.companyId === id);
  contactsToDelete.forEach(c => deleteCRMContact(c.id));

  const oppsToDelete = state.opportunities.filter(o => o.companyId === id);
  oppsToDelete.forEach(o => deleteCRMOpportunity(o.id));

  const updated = state.companies.filter(c => c.id !== id);
  persist('companies', updated);
  if (target) logAction('CRM: Company Deleted', `Removed company "${target.name}"`);

  deleteRecordFromApi('companies', id);
};

// ==========================================
// CONTACT OPERATIONS
// ==========================================

export const getCRMContacts = (): CRMContact[] => [...state.contacts];

export const getCRMContactById = (id: string): CRMContact | undefined =>
  state.contacts.find(c => c.id === id);

export const getContactsByCompany = (companyId: string): CRMContact[] =>
  state.contacts.filter(c => c.companyId === companyId);

export const getPrimaryContact = (companyId: string): CRMContact | undefined =>
  state.contacts.find(c => c.companyId === companyId && c.isPrimary);

export const findContactByEmail = (email: string): CRMContact | undefined =>
  state.contacts.find(c => 
    (c.email || '').toLowerCase().trim() === email.toLowerCase().trim()
  );

export const addCRMContact = (contact: Omit<CRMContact, 'id' | 'createdAt'>): CRMContact => {
  const newContact: CRMContact = {
    ...contact,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  
  const updated = [...state.contacts, newContact];
  persist('contacts', updated, newContact);
  
  return newContact;
};

export const updateCRMContact = (contact: CRMContact): void => {
  const updated = state.contacts.map(c => c.id === contact.id ? contact : c);
  persist('contacts', updated, contact);
};

export const deleteCRMContact = (id: string): void => {
  const updated = state.contacts.filter(c => c.id !== id);
  persist('contacts', updated);

  deleteRecordFromApi('contacts', id);
};

// ==========================================
// OPPORTUNITY OPERATIONS
// ==========================================

export const getCRMOpportunities = (): CRMOpportunity[] => [...state.opportunities];

export const getCRMOpportunityById = (id: string): CRMOpportunity | undefined =>
  state.opportunities.find(o => o.id === id);

export const getOpportunitiesByStatus = (status: OpportunityStatus): CRMOpportunity[] =>
  state.opportunities.filter(o => o.status === status);

export const getOpportunitiesByAssignedTo = (userId: string): CRMOpportunity[] =>
  state.opportunities.filter(o => o.assignedTo === userId);

export const getOpportunitiesNeedingFollowUp = (): CRMOpportunity[] => {
  const today = new Date().toISOString().split('T')[0];
  return state.opportunities.filter(o => {
    if (o.status === 'closed_won' || o.status === 'closed_lost') return false;
    if (!o.nextFollowUpDate) return true;
    return o.nextFollowUpDate <= today;
  });
};

export const addCRMOpportunity = (
  opportunity: Omit<CRMOpportunity, 'id' | 'createdAt' | 'updatedAt' | 'numberOfAttempts' | 'daysInCurrentStage' | 'stageHistory'>
): CRMOpportunity => {
  const now = new Date().toISOString();
  const newOpportunity: CRMOpportunity = {
    ...opportunity,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    numberOfAttempts: 0,
    daysInCurrentStage: 0,
    stageHistory: [{
      stage: opportunity.stage,
      enteredAt: now,
      daysInStage: 0,
    }],
  };
  
  const updated = [...state.opportunities, newOpportunity];
  persist('opportunities', updated, newOpportunity);
  
  // Create initial task if nextFollowUpDate provided
  if (opportunity.nextFollowUpDate) {
    addCRMTask({
      opportunityId: newOpportunity.id,
      type: 'follow_up',
      title: `Follow up with ${getCompanyName(newOpportunity.companyId)}`,
      dueDate: opportunity.nextFollowUpDate,
      status: 'pending',
      priority: 'medium',
      assignedTo: opportunity.assignedTo || opportunity.createdBy,
      createdBy: opportunity.createdBy,
      createdAt: now,
    });
  }
  
  const companyName = getCompanyName(newOpportunity.companyId);
  logAction('CRM: Lead Created', `New opportunity for "${companyName}" — status: ${newOpportunity.status}`);
  logger.info('CRM Opportunity added:', newOpportunity.id);
  return newOpportunity;
};

export const updateCRMOpportunity = (opportunity: CRMOpportunity): void => {
  const existing = state.opportunities.find(o => o.id === opportunity.id);
  if (!existing) return;
  
  // Track stage changes
  let stageHistory = existing.stageHistory;
  if (existing.stage !== opportunity.stage) {
    const now = new Date().toISOString();
    
    // Close previous stage
    stageHistory = stageHistory.map(h => 
      h.stage === existing.stage && !h.exitedAt 
        ? { ...h, exitedAt: now, daysInStage: calculateDaysBetween(h.enteredAt, now) }
        : h
    );
    
    // Add new stage
    stageHistory = [...stageHistory, {
      stage: opportunity.stage,
      enteredAt: now,
      daysInStage: 0,
    }];
  }
  
  const updated = state.opportunities.map(o =>
    o.id === opportunity.id
      ? {
          ...opportunity,
          updatedAt: new Date().toISOString(),
          stageHistory,
          daysInCurrentStage: calculateDaysInStage(stageHistory, opportunity.stage),
        }
      : o
  );

  if (existing.status !== opportunity.status) {
    logAction('CRM: Lead Status Changed', `"${getCompanyName(opportunity.companyId)}" moved from ${existing.status} → ${opportunity.status}`);
  }

  persist('opportunities', updated, updated.find(o => o.id === opportunity.id));
};

export const updateOpportunityStatus = (
  opportunityId: string, 
  status: OpportunityStatus, 
  stage: OpportunityStage,
  options?: { closedReason?: string; actualValue?: number }
): void => {
  const opportunity = getCRMOpportunityById(opportunityId);
  if (!opportunity) return;
  
  const now = new Date().toISOString();
  
  updateCRMOpportunity({
    ...opportunity,
    status,
    stage,
    ...(status === 'closed_won' || status === 'closed_lost' ? {
      closedAt: now,
      closedReason: options?.closedReason,
      actualValue: options?.actualValue,
    } : {}),
  });
};

export const deleteCRMOpportunity = (id: string): void => {
  const target = state.opportunities.find(o => o.id === id);
  const cascadedTouchpoints = state.touchpoints.filter(t => t.opportunityId === id);
  const cascadedTasks = state.tasks.filter(t => t.opportunityId === id);
  const updatedTouchpoints = state.touchpoints.filter(t => t.opportunityId !== id);
  const updatedTasks = state.tasks.filter(t => t.opportunityId !== id);
  const updatedOpportunities = state.opportunities.filter(o => o.id !== id);

  persist('touchpoints', updatedTouchpoints);
  persist('tasks', updatedTasks);
  persist('opportunities', updatedOpportunities);
  if (target) logAction('CRM: Lead Deleted', `Removed opportunity for "${getCompanyName(target.companyId)}"`);

  // Hard-delete from API so items don't reappear after cloud pull —
  // cascaded touchpoints/tasks included, they'd resurrect otherwise.
  deleteRecordFromApi('opportunities', id);
  cascadedTouchpoints.forEach(t => deleteRecordFromApi('touchpoints', t.id));
  cascadedTasks.forEach(t => deleteRecordFromApi('tasks', t.id));
};

// ==========================================
// TOUCHPOINT (ACTIVITY) OPERATIONS
// ==========================================

export const getCRMTouchpoints = (): CRMTouchpoint[] => 
  [...state.touchpoints].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

export const getTouchpointsByOpportunity = (opportunityId: string): CRMTouchpoint[] =>
  state.touchpoints
    .filter(t => t.opportunityId === opportunityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const addCRMTouchpoint = (
  touchpoint: Omit<CRMTouchpoint, 'id' | 'createdAt'>
): CRMTouchpoint => {
  const newTouchpoint: CRMTouchpoint = {
    ...touchpoint,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  
  const updated = [...state.touchpoints, newTouchpoint];
  persist('touchpoints', updated, newTouchpoint);
  const tpCompany = getCompanyName(getCRMOpportunityById(touchpoint.opportunityId)?.companyId || '');
  logAction('CRM: Outreach Logged', `${touchpoint.type.replace(/_/g, ' ')} (${touchpoint.direction}) for "${tpCompany}"`);

  // Update opportunity stats
  const opportunity = getCRMOpportunityById(touchpoint.opportunityId);
  if (opportunity) {
    const updates: Partial<CRMOpportunity> = {
      lastContactDate: newTouchpoint.createdAt,
    };
    
    // Increment attempts for outbound activities
    if (touchpoint.direction === 'outbound' && 
        ['call_made', 'email_sent', 'linkedin_connect', 'sms_sent'].includes(touchpoint.type)) {
      updates.numberOfAttempts = opportunity.numberOfAttempts + 1;
    }
    
    updateCRMOpportunity({ ...opportunity, ...updates });
  }
  
  return newTouchpoint;
};

// Convenience methods for logging specific activity types
export const logCall = (
  opportunityId: string,
  contactId: string,
  outcome: TouchpointOutcome,
  notes: string,
  durationSeconds: number,
  createdBy: string
): void => {
  addCRMTouchpoint({
    opportunityId,
    type: durationSeconds && durationSeconds > 30 ? 'call_connected' : 'call_made',
    direction: 'outbound',
    content: notes,
    outcome,
    durationSeconds,
    createdBy,
  });
  
  // Also log to call logs for detailed tracking
  const newLog: CRMCallLog = {
    id: generateId(),
    opportunityId,
    contactId,
    phoneNumber: getCRMContactById(contactId)?.phone || '',
    direction: 'outbound',
    startedAt: new Date().toISOString(),
    durationSeconds: durationSeconds || 0,
    outcome,
    notes,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  addCRMCallLog(newLog);
};

export const logEmail = (
  opportunityId: string,
  subject: string,
  content: string,
  direction: TouchpointDirection,
  createdBy: string,
  options?: {
    clientResponse?: string;
    sentiment?: TouchpointSentiment;
    outcome?: TouchpointOutcome;
  }
): void => {
  const type: TouchpointType = direction === 'outbound' ? 'email_sent' : 'email_replied';
  
  addCRMTouchpoint({
    opportunityId,
    type,
    direction,
    subject,
    content,
    clientResponse: options?.clientResponse,
    sentiment: options?.sentiment,
    outcome: options?.outcome,
    createdBy,
  });
};

// ==========================================
// TASK OPERATIONS
// ==========================================

export const getCRMTasks = (): CRMTask[] => 
  [...state.tasks].sort((a, b) => 
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

export const getTasksByOpportunity = (opportunityId: string): CRMTask[] =>
  state.tasks
    .filter(t => t.opportunityId === opportunityId)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

export const getTasksByAssignedTo = (userId: string): CRMTask[] =>
  state.tasks.filter(t => t.assignedTo === userId);

export const getOverdueTasks = (): CRMTask[] => {
  const now = new Date().toISOString();
  return state.tasks.filter(t => 
    t.status !== 'completed' && 
    t.status !== 'cancelled' &&
    t.dueDate < now
  );
};

export const getTasksDueToday = (): CRMTask[] => {
  const today = new Date().toISOString().split('T')[0];
  return state.tasks.filter(t => 
    t.status !== 'completed' && 
    t.status !== 'cancelled' &&
    t.dueDate.startsWith(today)
  );
};

export const addCRMTask = (task: Omit<CRMTask, 'id'>): CRMTask => {
  const newTask: CRMTask = {
    ...task,
    id: generateId(),
  };
  
  const updated = [...state.tasks, newTask];
  persist('tasks', updated, newTask);
  logAction('CRM: Task Created', `Task "${newTask.title}" due ${newTask.dueDate}`);

  return newTask;
};

export const completeCRMTask = (
  taskId: string, 
  completionNotes: string, 
  completedBy: string
): void => {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const now = new Date().toISOString();
  
  const updated = state.tasks.map(t => 
    t.id === taskId 
      ? {
          ...t,
          status: 'completed' as CRMTaskStatus,
          completedAt: now,
          completedBy,
          completionNotes,
        }
      : t
  );
  
  persist('tasks', updated, updated.find(t => t.id === taskId));
  logAction('CRM: Task Completed', `Completed task "${task.title}"`);

  // Update opportunity's next follow-up if this was a follow-up task
  const opportunity = getCRMOpportunityById(task.opportunityId);
  if (opportunity && task.type === 'follow_up') {
    // Clear the next follow-up date or set to next scheduled
    const nextTask = getTasksByOpportunity(task.opportunityId)
      .filter(t => t.id !== taskId && t.status === 'pending')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    
    updateCRMOpportunity({
      ...opportunity,
      nextFollowUpDate: nextTask?.dueDate,
    });
  }
};

export const updateCRMTask = (task: CRMTask): void => {
  const updated = state.tasks.map(t => t.id === task.id ? task : t);
  persist('tasks', updated, task);
};

export const deleteCRMTask = (id: string): void => {
  const updated = state.tasks.filter(t => t.id !== id);
  persist('tasks', updated);

  deleteRecordFromApi('tasks', id);
};

// ==========================================
// CALL LOG OPERATIONS
// ==========================================

export const getCRMCallLogs = (): CRMCallLog[] => 
  [...state.callLogs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

export const getCallLogsByOpportunity = (opportunityId: string): CRMCallLog[] =>
  state.callLogs
    .filter(l => l.opportunityId === opportunityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const addCRMCallLog = (log: CRMCallLog): void => {
  const updated = [...state.callLogs, log];
  persist('callLogs', updated, log);
};

// ==========================================
// CSV IMPORT/EXPORT
// ==========================================

export interface CSVImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: Array<{ row: number; email: string; company: string }>;
}

export interface CSVValidationError {
  row: number;
  column: string;
  value: string;
  message: string;
}

export const parseCSV = (csvText: string): CRMCSVRow[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]);
  const rows: CRMCSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });
    
    rows.push(row as CRMCSVRow);
  }
  
  return rows;
};

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
};

export const validateCSVRow = (row: CRMCSVRow, rowNumber: number): CSVValidationError[] => {
  const errors: CSVValidationError[] = [];
  
  // Required fields
  if (!row['Company Name']?.trim()) {
    errors.push({ row: rowNumber, column: 'Company Name', value: '', message: 'Company Name is required' });
  }
  
  if (!row['Primary Contact Name']?.trim()) {
    errors.push({ row: rowNumber, column: 'Primary Contact Name', value: '', message: 'Primary Contact Name is required' });
  }
  
  // Email validation
  if (row['Email Address'] && !EMAIL_REGEX.test(row['Email Address'])) {
    errors.push({ row: rowNumber, column: 'Email Address', value: row['Email Address'], message: 'Invalid email format' });
  }
  
  // Phone validation (basic)
  if (row['Phone Number'] && !row['Phone Number'].match(/^[\d\s\-\+\(\)]{7,20}$/)) {
    errors.push({ row: rowNumber, column: 'Phone Number', value: row['Phone Number'], message: 'Invalid phone format' });
  }
  
  // URL validation
  if (row['Website'] && !row['Website'].match(/^https?:\/\/.+/i)) {
    errors.push({ row: rowNumber, column: 'Website', value: row['Website'], message: 'URL must start with http:// or https://' });
  }
  
  // Status validation
  const validStatuses: OpportunityStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
  if (row['Opportunity Status'] && !validStatuses.includes(row['Opportunity Status'])) {
    errors.push({ row: rowNumber, column: 'Opportunity Status', value: row['Opportunity Status'], message: `Must be one of: ${validStatuses.join(', ')}` });
  }
  
  // Numeric fields
  if (row['Estimated Deal Value']) {
    const value = parseFloat(String(row['Estimated Deal Value']).replace(/[$,]/g, ''));
    if (isNaN(value) || value < 0) {
      errors.push({ row: rowNumber, column: 'Estimated Deal Value', value: String(row['Estimated Deal Value']), message: 'Must be a positive number' });
    }
  }
  
  if (row['Number of Attempts']) {
    const attempts = parseInt(String(row['Number of Attempts']));
    if (isNaN(attempts) || attempts < 0) {
      errors.push({ row: rowNumber, column: 'Number of Attempts', value: String(row['Number of Attempts']), message: 'Must be a positive integer' });
    }
  }
  
  return errors;
};

export const checkForDuplicates = (row: CRMCSVRow): { isDuplicate: boolean; existingOpportunity?: CRMOpportunity } => {
  // Check by email
  if (row['Email Address']) {
    const existingContact = state.contacts.find(c => 
      c.email?.toLowerCase() === row['Email Address']?.toLowerCase()
    );
    if (existingContact) {
      const opportunity = state.opportunities.find(o => o.companyId === existingContact.companyId);
      return { isDuplicate: true, existingOpportunity: opportunity };
    }
  }
  
  // Check by company name
  const existingCompany = state.companies.find(c => 
    c.name.toLowerCase().trim() === (row['Company Name'] || '').toLowerCase().trim()
  );
  if (existingCompany) {
    const opportunity = state.opportunities.find(o => o.companyId === existingCompany.id);
    return { isDuplicate: true, existingOpportunity: opportunity };
  }
  
  return { isDuplicate: false };
};

export const importCSVRow = (
  row: CRMCSVRow, 
  createdBy: string,
  options: { skipDuplicates?: boolean; updateExisting?: boolean } = {}
): { success: boolean; opportunity?: CRMOpportunity; error?: string } => {
  try {
    // Check for duplicates
    const duplicateCheck = checkForDuplicates(row);
    
    if (duplicateCheck.isDuplicate) {
      if (options.skipDuplicates) {
        return { success: false, error: 'Duplicate found - skipped' };
      }
      
      if (options.updateExisting && duplicateCheck.existingOpportunity) {
        // Update existing
        const existing = duplicateCheck.existingOpportunity;
        
        // Update fields from CSV
        const updates: Partial<CRMOpportunity> = {
          status: row['Opportunity Status'] ? normalizeOpportunityStatus(row['Opportunity Status']) : existing.status,
          stage: row['Opportunity Stage'] as OpportunityStage || existing.stage,
          estimatedValue: parseFloat(String(row['Estimated Deal Value']).replace(/[$,]/g, '')) || existing.estimatedValue,
          locationInterest: row['Location Interest (Zone/City)'] || existing.locationInterest,
          billboardType: row['Billboard Type Interest'] || existing.billboardType,
          campaignDuration: row['Campaign Duration'] || existing.campaignDuration,
          leadSource: row['Lead Source'] || existing.leadSource,
          lastContactDate: row['Last Contact Date'] || existing.lastContactDate,
          nextFollowUpDate: row['Next Follow-Up Date'] || existing.nextFollowUpDate,
          callOutcomeNotes: row['Call Outcome/Notes'] || existing.callOutcomeNotes,
          numberOfAttempts: parseInt(String(row['Number of Attempts'])) || existing.numberOfAttempts,
        };
        
        updateCRMOpportunity({ ...existing, ...updates });
        return { success: true, opportunity: { ...existing, ...updates } };
      }
    }
    
    // Create new records
    const now = new Date().toISOString();
    
    // 1. Create Company
    const company = addCRMCompany({
      name: sanitizeString(row['Company Name']),
      industry: row['Company Industry'],
      website: row['Website'],
      streetAddress: row['Street Address'],
      city: row['City'],
      country: row['Country'],
    });
    
    // 2. Create Primary Contact
    const primaryContact = addCRMContact({
      companyId: company.id,
      fullName: sanitizeString(row['Primary Contact Name']),
      jobTitle: row['Job Title'],
      phone: row['Phone Number'],
      email: (row['Email Address'] || '').toLowerCase().trim(),
      linkedinUrl: row['LinkedIn Profile'],
      isPrimary: true,
    });
    
    // 3. Create Secondary Contact if provided
    let secondaryContactId: string | undefined;
    if (row['Secondary Contact']) {
      const secondary = addCRMContact({
        companyId: company.id,
        fullName: sanitizeString(row['Secondary Contact']),
        isPrimary: false,
      });
      secondaryContactId = secondary.id;
    }
    
    // 4. Create Opportunity
    const opportunity = addCRMOpportunity({
      companyId: company.id,
      primaryContactId: primaryContact.id,
      secondaryContactId,
      locationInterest: row['Location Interest (Zone/City)'],
      billboardType: row['Billboard Type Interest'],
      campaignDuration: row['Campaign Duration'],
      estimatedValue: parseFloat(String(row['Estimated Deal Value']).replace(/[$,]/g, '')) || undefined,
      status: normalizeOpportunityStatus(row['Opportunity Status'] || 'new'),
      stage: (row['Opportunity Stage'] || 'new_lead') as OpportunityStage,
      leadSource: row['Lead Source'],
      lastContactDate: row['Last Contact Date'],
      nextFollowUpDate: row['Next Follow-Up Date'],
      callOutcomeNotes: row['Call Outcome/Notes'],
      assignedTo: createdBy,
      createdBy,
    });
    
    return { success: true, opportunity };
  } catch (error) {
    logger.error('CSV import error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const importCSV = (
  csvText: string, 
  createdBy: string,
  options: { skipDuplicates?: boolean; updateExisting?: boolean } = {}
): CSVImportResult => {
  const rows = parseCSV(csvText);
  const result: CSVImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: [],
  };
  
  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because header is row 1
    
    // Validate
    const validationErrors = validateCSVRow(row, rowNumber);
    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors.map(e => `Row ${e.row}: ${e.column} - ${e.message}`));
      return;
    }
    
    // Check duplicates
    const duplicateCheck = checkForDuplicates(row);
    if (duplicateCheck.isDuplicate) {
      result.duplicates.push({
        row: rowNumber,
        email: row['Email Address'] || '',
        company: row['Company Name'],
      });
      
      if (options.skipDuplicates && !options.updateExisting) {
        result.skipped++;
        return;
      }
    }
    
    // Import
    const importResult = importCSVRow(row, createdBy, options);
    if (importResult.success) {
      result.imported++;
    } else {
      result.errors.push(`Row ${rowNumber}: ${importResult.error}`);
    }
  });
  
  result.success = result.errors.length === 0;
  if (result.imported > 0) {
    logAction('CRM: CSV Imported', `Imported ${result.imported} leads, skipped ${result.skipped} duplicates`);
  }
  return result;
};

export const exportToCSV = (): string => {
  const headers = [
    'Company Name',
    'Company Industry',
    'Website',
    'Primary Contact Name',
    'Job Title',
    'Phone Number',
    'Email Address',
    'LinkedIn Profile',
    'Secondary Contact',
    'Location Interest (Zone/City)',
    'Billboard Type Interest',
    'Campaign Duration',
    'Estimated Deal Value',
    'Opportunity Status',
    'Opportunity Stage',
    'Lead Source',
    'Last Contact Date',
    'Next Follow-Up Date',
    'Call Outcome/Notes',
    'Number of Attempts',
    'Street Address',
    'City',
    'Country',
  ];
  
  const rows = state.opportunities.map(opp => {
    const company = getCRMCompanyById(opp.companyId);
    const primaryContact = getCRMContactById(opp.primaryContactId);
    const secondaryContact = opp.secondaryContactId ? getCRMContactById(opp.secondaryContactId) : undefined;
    
    return [
      company?.name || '',
      company?.industry || '',
      company?.website || '',
      primaryContact?.fullName || '',
      primaryContact?.jobTitle || '',
      primaryContact?.phone || '',
      primaryContact?.email || '',
      primaryContact?.linkedinUrl || '',
      secondaryContact?.fullName || '',
      opp.locationInterest || '',
      opp.billboardType || '',
      opp.campaignDuration || '',
      opp.estimatedValue?.toString() || '',
      opp.status,
      opp.stage,
      opp.leadSource || '',
      opp.lastContactDate || '',
      opp.nextFollowUpDate || '',
      opp.callOutcomeNotes || '',
      opp.numberOfAttempts.toString(),
      company?.streetAddress || '',
      company?.city || '',
      company?.country || '',
    ].map(escapeCSVValue).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
};

const escapeCSVValue = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

// ==========================================
// ANALYTICS & METRICS
// ==========================================

export const getCRMPipelineMetrics = (): CRMPipelineMetrics => {
  const opportunities = state.opportunities;
  const touchpoints = state.touchpoints;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // By status
  const byStatus: Record<OpportunityStatus, { count: number; value: number; avgDaysInStage: number }> = {
    new: { count: 0, value: 0, avgDaysInStage: 0 },
    contacted: { count: 0, value: 0, avgDaysInStage: 0 },
    qualified: { count: 0, value: 0, avgDaysInStage: 0 },
    proposal: { count: 0, value: 0, avgDaysInStage: 0 },
    negotiation: { count: 0, value: 0, avgDaysInStage: 0 },
    closed_won: { count: 0, value: 0, avgDaysInStage: 0 },
    closed_lost: { count: 0, value: 0, avgDaysInStage: 0 },
  };
  
  opportunities.forEach(opp => {
    // Never crash on an out-of-vocabulary status — bucket it as 'new'
    const bucket = byStatus[opp.status] || byStatus[normalizeOpportunityStatus(opp.status)];
    bucket.count++;
    bucket.value += opp.estimatedValue || 0;
    bucket.avgDaysInStage += opp.daysInCurrentStage || 0;
  });
  
  // Calculate averages
  Object.keys(byStatus).forEach(status => {
    const s = status as OpportunityStatus;
    if (byStatus[s].count > 0) {
      byStatus[s].avgDaysInStage = Math.round(byStatus[s].avgDaysInStage / byStatus[s].count);
    }
  });
  
  // Conversion rates
  const newLeads = byStatus.new.count + byStatus.contacted.count + byStatus.qualified.count + 
                   byStatus.proposal.count + byStatus.negotiation.count + byStatus.closed_won.count;
  const totalClosed = byStatus.closed_won.count + byStatus.closed_lost.count;
  
  const conversionRates = {
    leadToContacted: newLeads > 0 ? Math.round((byStatus.contacted.count / newLeads) * 100) : 0,
    contactedToQualified: byStatus.contacted.count > 0 ? Math.round((byStatus.qualified.count / byStatus.contacted.count) * 100) : 0,
    qualifiedToProposal: byStatus.qualified.count > 0 ? Math.round((byStatus.proposal.count / byStatus.qualified.count) * 100) : 0,
    proposalToClosed: (byStatus.proposal.count + byStatus.negotiation.count) > 0 
      ? Math.round((byStatus.closed_won.count / (byStatus.proposal.count + byStatus.negotiation.count)) * 100) 
      : 0,
    overall: totalClosed > 0 ? Math.round((byStatus.closed_won.count / totalClosed) * 100) : 0,
  };
  
  // Activity metrics
  const activityMetrics = {
    callsMade: touchpoints.filter(t => t.type === 'call_made' || t.type === 'call_connected').length,
    callsConnected: touchpoints.filter(t => t.type === 'call_connected').length,
    emailsSent: touchpoints.filter(t => t.type === 'email_sent').length,
    emailsOpened: touchpoints.filter(t => t.type === 'email_opened').length,
    emailsReplied: touchpoints.filter(t => t.type === 'email_replied').length,
    meetingsScheduled: touchpoints.filter(t => t.type === 'meeting_scheduled').length,
    meetingsCompleted: touchpoints.filter(t => t.type === 'meeting_completed').length,
  };
  
  return {
    totalOpportunities: opportunities.length,
    totalValue: opportunities.reduce((sum, o) => sum + (o.estimatedValue || 0), 0),
    weightedValue: opportunities.reduce((sum, o) => {
      const weight = o.status === 'closed_won' ? 1 : o.status === 'proposal' ? 0.7 : o.status === 'qualified' ? 0.4 : 0.2;
      return sum + ((o.estimatedValue || 0) * weight);
    }, 0),
    byStatus,
    conversionRates,
    activityMetrics,
    overdueTasks: getOverdueTasks().length,
    tasksDueToday: getTasksDueToday().length,
    followUpsRequired: opportunities.filter(o => {
      if (o.status === 'closed_won' || o.status === 'closed_lost') return false;
      if (!o.nextFollowUpDate) return true;
      return o.nextFollowUpDate <= today;
    }).length,
  };
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const getCompanyName = (companyId: string): string => {
  const company = getCRMCompanyById(companyId);
  return company?.name || 'Unknown Company';
};

const calculateDaysBetween = (start: string, end: string): number => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const calculateDaysInStage = (history: StageHistoryEntry[], currentStage: OpportunityStage): number => {
  const entry = history.find(h => h.stage === currentStage && !h.exitedAt);
  if (!entry) return 0;
  return calculateDaysBetween(entry.enteredAt, new Date().toISOString());
};

const isThisMonth = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const isToday = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  return dateStr.startsWith(new Date().toISOString().split('T')[0]);
};

// Initialize with sample data if empty (development only)
export const initializeSampleCRMData = (userId: string): void => {
  if (state.opportunities.length > 0) return;
  
  const sampleCSV = `Company Name,Company Industry,Website,Primary Contact Name,Job Title,Phone Number,Email Address,Location Interest (Zone/City),Billboard Type Interest,Campaign Duration,Estimated Deal Value,Opportunity Status,Opportunity Stage,Lead Source,Next Follow-Up Date,Street Address,City,Country
ABC Retail Ltd,Retail,https://abcretail.com,John Smith,Marketing Director,+263772123456,john.smith@abcretail.com,Harare CBD,LED Digital,6 months,15000,new,new_lead,Website,2026-03-15,123 Main Street,Harare,Zimbabwe
XYZ Bank,Banking,https://xyzbank.co.zw,Sarah Johnson,Brand Manager,+263773987654,sarah.j@xyzbank.co.zw,Bulawayo,Static Billboard,12 months,45000,contacted,initial_contact,Referral,2026-03-12,456 Park Lane,Bulawayo,Zimbabwe`;
  
  importCSV(sampleCSV, userId, { skipDuplicates: false });
  logger.info('Sample CRM data initialized');
};
