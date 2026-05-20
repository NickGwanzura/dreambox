# Contract Amendment Feature — Comprehensive Fix Plan

## Overview

The Contract Amendment feature allows users to extend, reduce, or change the rate on existing contracts with full audit trail, availability checking, financial impact preview, and auto-invoice generation. This plan addresses all identified issues.

---

## Issue 1 — Integrate `ContractAmendmentModal` into `ContractList.tsx`

**Severity:** 🔴 High  
**File:** [`components/ContractList.tsx`](components/ContractList.tsx)  
**Current Behavior:** The "Adjust Term" button (line 412) calls `openTermAdjustment` which opens the generic **Edit modal**, not the amendment modal. This means users on the Contracts tab modify contracts directly without audit trail.

**Fix:** Replace the `openTermAdjustment` handler to launch [`ContractAmendmentModal`](components/ContractAmendmentModal.tsx) instead, matching the behavior in [`Rentals.tsx`](components/Rentals.tsx:1493).

**Changes:**
1. Import `ContractAmendmentModal` at top of [`ContractList.tsx`](components/ContractList.tsx)
2. Add state: `const [amendContract, setAmendContract] = useState<Contract | null>(null);`
3. Rename existing `openTermAdjustment` to `openDirectEdit` (or repurpose)
4. Create new `openAmendmentModal` function that sets `amendContract`
5. Update the "Adjust Term" button (line 412) to call `openAmendmentModal`
6. Render `<ContractAmendmentModal>` conditionally at bottom (before the `sendModal` block)
7. Add `onApplied` callback that refreshes the contracts list

```tsx
// New state
const [amendContract, setAmendContract] = useState<Contract | null>(null);

// New handler
const openAmendmentModal = (contract: Contract) => {
    setSelectedContract(null);
    setAmendContract(contract);
};

// Render before sendModal
{amendContract && (
    <ContractAmendmentModal
        contract={amendContract}
        onClose={() => setAmendContract(null)}
        onApplied={() => {
            setAmendContract(null);
            setContracts([...getContracts()]);
        }}
    />
)}
```

---

## Issue 2 — Fix Rollback No-Op in `handleApply`

**Severity:** 🔴 High  
**File:** [`components/ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx)  
**Current Behavior:** Lines 231-238 catch contract update failure but the rollback `try/catch` block is empty. If the contract update fails after the amendment is saved locally + synced to Neon, the amendment becomes an orphan record.

**Root Cause:** The comment explains the strategy (apply amendment first, then contract), but the rollback has no mechanism to rewind the local amendment or the Neon sync.

**Fix Strategy:** Use a snapshot-based rollback approach.

**Changes to [`handleApply`](components/ContractAmendmentModal.tsx:130):**

```typescript
// Before applying amendment, snapshot current state
const preAmendmentContracts = [...contracts]; // Snapshot of local contracts array
const preAmendmentAmendments = [...contractAmendments]; // Snapshot of amendments

try {
    // Apply amendment first
    addContractAmendment(amendment);
} catch (amendmentErr) {
    setError('Failed to record amendment. No changes were made.');
    setSaving(false);
    return;
}

// Then update the contract
try {
    updateContract(updatedContract);
} catch (contractErr) {
    // Rollback: undo the amendment by deleting it from local state + Neon queue
    console.error('Contract update failed. Rolling back amendment...');
    try {
        // Delete the amendment locally
        deleteContractAmendment(amendment.id);
        // Restore contract to previous state
        contracts = preAmendmentContracts;
        saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
        // Restore amendments
        contractAmendments = preAmendmentAmendments;
        saveToStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, contractAmendments);
        syncToCloudMirror();
        notifyListeners();
    } catch (rollbackErr) {
        console.error('CRITICAL: Rollback also failed. Data may be inconsistent.', rollbackErr);
        setError('Contract update failed and rollback encountered an error. Please check your data integrity.');
        setSaving(false);
        return;
    }
    setError('Failed to apply amendment to the contract. All changes have been rolled back. Please try again.');
    setSaving(false);
    return;
}
```

> **Note:** This requires importing `deleteContractAmendment` in the modal. Currently it's in [`mockData.ts:598`](services/mockData.ts:598). The modal already imports from mockData, so just add it to the import line.

**Alternative (minimal-risk):** Swap the order — apply the contract update FIRST, then the amendment. If the contract fails, nothing is saved. If the amendment fails after the contract updated, roll back the contract:

```typescript
// Save contract first (the heavier operation)
try {
    updateContract(updatedContract);
} catch (contractErr) {
    setError('Failed to update contract. No changes were applied.');
    setSaving(false);
    return;
}

// Then save amendment (the lighter audit record)
try {
    addContractAmendment(amendment);
} catch (amendmentErr) {
    // Contract is already updated, so roll it back
    contracts = contracts.map(c => c.id === contract.id ? contract : c);
    saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
    syncToCloudMirror();
    notifyListeners();
    setError('Contract was updated but the amendment record failed to save. The contract has been rolled back.');
    setSaving(false);
    return;
}
```

**Recommendation:** Use the second approach (contract-first) — it minimizes risk because amendments are an audit artifact, while the contract is the source of truth.

---

## Issue 3 — Extension Invoices Use Original Rate

**Severity:** 🟡 Medium  
**File:** [`components/ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx)  
**Current Behavior:** Line 247 uses `contract.monthlyRate` (the original rate) instead of the potentially changed rate. While the extension tab doesn't change rates, this creates a fragile coupling — if the code is refactored to allow combined changes, invoices would be incorrect.

**Fix:** Use the effective rate consistently. In the extension code path, `effectiveMonthlyRate` is already computed at line 165 as `contract.monthlyRate` when `activeTab !== 'rate_change'`. However, the invoice generation at line 247 doesn't reference it.

```typescript
// Line 243-263 — Change from:
const gross = contract.monthlyRate;
// To:
const gross = effectiveMonthlyRate;
```

---

## Issue 4 — Amendment ID Collision Risk

**Severity:** 🟡 Medium  
**File:** [`components/ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx)  
**Current Behavior:** Line 181 generates IDs as `AM-${Date.now().toString().slice(-6)}` — only using the last 6 digits of timestamp, which gives ~1ms resolution and ~1M unique values, but collisions are possible within the same millisecond.

**Fix:** Use a more unique ID generation strategy. Options:

1. **Full timestamp + random suffix** (preferred):
```typescript
const generateAmendmentId = () => {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `AM-${ts}-${rand}`;
};
```

2. **Use `crypto.randomUUID()`** (if available in the runtime):
```typescript
const id = `AM-${crypto.randomUUID().slice(0, 8)}`;
```

---

## Issue 5 — No `other` Amendment Type in UI

**Severity:** 🟡 Low  
**Files:** [`components/ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx), [`api/contract-amendments.ts`](api/contract-amendments.ts)  
**Current Behavior:** The [`ContractAmendment`](types.ts:107) type and the API schema include `'other'` as a valid type, but the UI only has 3 tabs (`extension`, `reduction`, `rate_change`).

**Fix (Optional Enhancement):** Add a 4th tab for "Other" amendments — a free-form amendment where the user manually enters the new values for any field. This is a convenience feature.

**Changes:**
1. Add a 4th tab button in the tab bar (line 316)
2. Create a free-form input area for entering new values
3. Add `'other'` to the `AmendmentTab` type
4. Handle the `'other'` case in calculations (financialImpact could be manually entered)

**Defer decision:** This is a feature enhancement, not a bug fix. Recommend deferring unless the business requires it.

---

## Issue 6 — No Amendment Editing/Deletion UI

**Severity:** 🟡 Medium  
**Files:** [`components/ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx), [`components/Rentals.tsx`](components/Rentals.tsx)  
**Current Behavior:** The API supports PUT (edit) and DELETE for amendments, but there's no UI to edit or delete them. The amendment history is read-only.

**Fix:** Add action buttons to the amendment history items.

**Changes to [`ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx):**
1. Add a `deleteAmendment` function:
```typescript
const handleDeleteAmendment = (amendmentId: string) => {
    if (confirm('Are you sure you want to delete this amendment record? This cannot be undone.')) {
        deleteContractAmendment(amendmentId);
        // Refresh history by forcing re-render
        setShowHistory(true);
    }
};
```
2. Add a delete button (trash icon) to each history item in the history list (around line 606-628)
3. Sync on delete: `deleteContractAmendment` already handles cloud sync via `queueForDeletion` in [`mockData.ts:598-608`](services/mockData.ts:598)

---

## Issue 7 — Availability Check Only Considers Active Contracts

**Severity:** 🟡 Medium  
**File:** [`components/ContractAmendmentModal.tsx`](components/ContractAmendmentModal.tsx)  
**Current Behavior:** [`getAvailabilityForExtension`](components/ContractAmendmentModal.tsx:76) filters contracts by `status === 'active'`, ignoring `'Pending'` contracts that might have overlapping dates.

**Fix:** Include `'Pending'` contracts in the overlap check to prevent double-booking:

```typescript
// Line 86 — Change from:
String(c.status || '').toLowerCase() === 'active' &&
// To:
(['active', 'pending'] as string[]).includes(String(c.status || '').toLowerCase()) &&
```

**Note:** This should also be applied to the parallel availability check in [`ContractList.tsx:142`](components/ContractList.tsx:142) for consistency.

---

## Issue 8 — No Cascade Delete for Amendments on Contract Deletion

**Severity:** 🟡 Medium  
**File:** [`services/mockData.ts`](services/mockData.ts)  
**Current Behavior:** When a contract is deleted (line 333-368), contract amendments are not cascade-deleted. They remain orphaned in local storage and the cloud DB.

**Fix:** Add cascade deletion of amendments when a contract is deleted:

```typescript
// In deleteContract function (around line 340), add:
const linkedAmendments = contractAmendments.filter(a => a.contractId === id);
if (linkedAmendments.length > 0) {
    linkedAmendments.forEach(a => queueForDeletion('contract-amendments', a.id));
    contractAmendments = contractAmendments.filter(a => a.contractId !== id);
    saveToStorage(STORAGE_KEYS.CONTRACT_AMENDMENTS, contractAmendments);
    logAction('Delete Contract', `Cascade-deleted ${linkedAmendments.length} amendment(s) from contract ${id}`);
}
```

**Also in API:** The contract deletion in [`api/contracts.ts:93`](api/contracts.ts:93) already cascade-deletes invoices via transaction. Add `contractAmendment.deleteMany` to the same transaction:

```typescript
// api/contracts.ts — add to the $transaction:
prisma.contractAmendment.deleteMany({ where: { contractId: id as string } }),
```

---

## Summary of All Changes

| # | Issue | Severity | Files Changed | Effort |
|---|-------|----------|---------------|--------|
| 1 | ContractList.tsx missing amendment modal | 🔴 High | `ContractList.tsx` | Medium |
| 2 | Rollback no-op in handleApply | 🔴 High | `ContractAmendmentModal.tsx` | Small |
| 3 | Extension invoices use original rate | 🟡 Medium | `ContractAmendmentModal.tsx` | Trivial (1 line) |
| 4 | Amendment ID collision risk | 🟡 Medium | `ContractAmendmentModal.tsx` | Trivial (1 function) |
| 5 | No `other` type in UI | 🟡 Low | `ContractAmendmentModal.tsx` | Medium (defer) |
| 6 | No amendment edit/delete UI | 🟡 Medium | `ContractAmendmentModal.tsx` | Small |
| 7 | Pending contracts not checked in availability | 🟡 Medium | `ContractAmendmentModal.tsx`, `ContractList.tsx` | Trivial (1 line each) |
| 8 | No cascade delete for amendments | 🟡 Medium | `mockData.ts`, `api/contracts.ts` | Small |

---

## Recommended Execution Order

1. **Issue 2** — Fix rollback (highest risk, data integrity issue)
2. **Issue 3** — Fix extension invoice rate (trivial change, prevents future bugs)
3. **Issue 4** — Fix ID generation (trivial change, prevents rare collisions)
4. **Issue 7** — Include Pending contracts in availability check (trivial, prevents double-booking)
5. **Issue 8** — Add cascade delete for amendments (data cleanup)
6. **Issue 6** — Add amendment delete UI (user-facing improvement)
7. **Issue 1** — Integrate into ContractList.tsx (largest change, user-facing)

---

## Mermaid Diagram: Fixed Data Flow

```mermaid
flowchart TD
    A[User clicks Amend] --> B{Which tab?}
    B -->|Extension| C[Pick new end date]
    B -->|Reduction| D[Pick earlier end date]
    B -->|Rate Change| E[Enter new rate]

    C --> F[Check availability]
    F -->|Available| G[Calculate financial impact]
    F -->|Conflict| H[Show error - conflict]

    D --> I[Check affected invoices]
    I --> G

    E --> G

    G --> J[User clicks Apply]
    J --> K{Validate}
    K -->|Invalid| L[Show error]
    K -->|Valid| M[Update contract FIRST]

    M -->|Success| N[Save amendment record]
    M -->|Fail| O[Show error - no changes made]

    N -->|Success| P{Auto-generate invoices?}
    N -->|Fail| Q[Rollback contract to snapshot]

    P -->|Extension + monthsDelta>0| R[Generate invoices for new months]
    P -->|No| S[Done]

    Q --> T[Show rollback error]
    R --> S
    S --> U[Refresh contract list]
