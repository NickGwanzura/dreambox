# DREAMBOX — Bug Fix Tasks

Instructions for an AI coding agent (Claude Sonnet, DeepSeek, etc.) to fix the bugs
catalogued below. Read this whole file before changing anything.

## Context you need

- **Stack:** React + Vite frontend, Express server (`server.ts`, run via `tsx`) adapting
  Vercel-style handlers in `api/`, Prisma + PostgreSQL (Neon), Cloudflare R2 for images.
- **Data model:** The app is offline-first. `services/mockData.ts` holds in-memory arrays
  mirrored to localStorage, synced to the server via `services/apiClient.ts`.
  `reloadAllFromApi()` hydrates from the server on login/startup and merges with
  local state. A `deletedQueue` (tombstone list) prevents deleted records from
  being re-imported by the merge. `services/crmService.ts` is a parallel store for
  CRM data with the same pattern but fewer safeguards.
- **Verify every change with:** `npx tsc --noEmit` (client typecheck — must stay clean)
  and `npx vitest run` (311 tests — all must pass). `npx tsc -p tsconfig.server.json`
  has ~101 pre-existing TS2835 errors repo-wide; ignore those, just don't add new kinds.
- Do NOT reformat unrelated code. Match existing style (the codebase uses long lines
  and inline handlers in places — leave them be).

## Already fixed — do not redo

These were fixed recently; listed so you don't duplicate or revert them:
CRM hydration (`reloadCRMFromApi`), invoice deletion (receipt revert persistence,
multi-receipt check, 403 rollback, deletedQueue flush), logo-in-PDF pipeline
(`/api/logo-proxy`, cache fix, hydration preservation), invoice duplication
(temp ids in `addInvoice`, id-less zombie cleanup in merge, double-submit guard
in `components/Financials.tsx`).

---

## Task 1 — CRITICAL: deactivated/demoted users keep access for up to 24h

**File:** `lib/auth.ts`

`requireAuth` trusts `role` and `status` from the JWT payload. Tokens live 24h
(`signToken`, `expiresIn: '24h'`). If an admin deactivates a user or demotes their
role, the user's existing token still carries `status: 'Active'` / the old role, so
every permission check (`requireAdmin`, `requireDeletePermission`, etc.) passes for
up to 24 hours.

**Fix:** In `requireAuth`, after verifying the token, load the user's current
`status` and `role` from the DB (`prisma.user.findUnique({ where: { id: payload.userId } })`)
and use those values for the checks and the returned payload. To avoid a DB hit on
every request, add a small in-memory TTL cache (e.g. 60s) keyed by userId — this is a
long-lived Express process, not serverless, so module-level cache works.
Note `requireAuth` is currently synchronous and called without `await` everywhere —
you must make it async and update **all** call sites in `api/**` (grep `requireAuth(`,
`requireAdmin(`, `requireManagerOrAdmin(`, `requireDeletePermission(`,
`requireQuotationWritePermission(`, `requireQuotationApprovePermission(`).

**Verify:** typecheck server, then manually: sign in, set that user Inactive in DB,
confirm the next API call within the cache TTL window +1 returns 403.

## Task 2 — HIGH: client-generated contract IDs collide

**Files:** `components/Financials.tsx:350`, `components/ContractList.tsx:345` (and
`:386`), `components/BillboardList.tsx:315,493,526,569`, `components/ClientList.tsx:62,223`

Contracts are created with `id: \`C-${Date.now().toString().slice(-4)}\`` — only
10,000 possible values, so collisions are guaranteed over time (and immediate if two
users create contracts in the same second). A colliding id silently overwrites/merges
records on PUT-upsert. Billboard/client ids use `Date.now()` variants — same class of
problem, lower frequency.

**Fix:** Use `generateId()` from `utils/sanitizers.ts` (already used by crmService)
for all of these call sites. Do not change existing stored ids. If any UI displays
the contract id as a human-facing number, keep displaying `id` as-is (existing short
ids still work).

**Verify:** create two contracts back-to-back; both must appear and survive reload.

## Task 3 — HIGH: deleting a contract destroys paid invoices (revenue history)

**File:** `services/mockData.ts` — `deleteContract` (~line 470)

`deleteContract` cascade-deletes **all** linked invoices of type Invoice, including
`Paid` ones, locally and on the server. Deleting an old contract silently erases
revenue records. Compare `endContract` (~line 532), which correctly deletes only
`Pending`/`Overdue` invoices.

**Fix:** In `deleteContract`, filter the cascade to
`i.status === 'Pending' || i.status === 'Overdue'` (same predicate as `endContract`).
Leave paid invoices in place with their `contractId` intact (the contract lookup
already handles missing contracts gracefully elsewhere).

**Verify:** vitest passes; create contract → invoice → mark paid → delete contract →
paid invoice must still exist.

## Task 4 — HIGH: paid-status and edits are lost on reload (no localStorage persist)

**File:** `services/mockData.ts` — `markInvoiceAsPaid` (~line 907) and
`updateInvoice` (~line 924)

Both mutate the in-memory `invoices` array but never write to localStorage. If the
server call fails (offline) or the user reloads before the next full save, the
change reverts. There is already a `persistInvoices()` helper in this file — use it.

**Fix:** Call `persistInvoices()` after the optimistic update in both functions, and
again after a rollback in the catch blocks (so the rollback is persisted too).

**Verify:** with the API offline (or `isConfigured()` false), mark an invoice paid,
reload — status must survive.

## Task 5 — HIGH: auto-billing can double-bill before hydration completes

**Files:** `components/Layout.tsx:230` + `services/mockData.ts` — `runAutoBilling` (~line 281)

`runAutoBilling()` runs on Layout mount and on an interval. Its "already billed this
month" check reads the local `invoices` array — which, right after startup, is stale
localStorage data because `reloadAllFromApi()` hasn't finished. If this device's
localStorage is missing an invoice another device already created, it creates a
duplicate monthly invoice on the server.

**Fix (pick both):**
1. Export a promise or flag from `mockData.ts` set when the first
   `reloadAllFromApi()` resolves; make `runAutoBilling` a no-op until hydration has
   completed at least once when `isConfigured()` is true.
2. Server-side idempotency: in `api/invoices.ts` POST, when the body has a
   `contractId` and type Invoice, reject (409) if an invoice for the same
   `contractId` with a `date` in the same YYYY-MM already exists. Client already
   tolerates POST failures.

**Verify:** seed a contract + current-month invoice in DB, clear localStorage, load
app — no duplicate invoice may be created.

## Task 6 — MEDIUM: CRM deletes resurrect on other devices (no tombstones)

**File:** `services/crmService.ts`

`reloadCRMFromApi()` merges server data with local state, preserving local-only
records. But CRM deletes (`deleteCRMCompany`, `deleteCRMContact`,
`deleteCRMOpportunity`, etc.) have **no tombstone queue**: they remove locally and
fire a server DELETE. If the server DELETE fails, or another device still has the
record in localStorage, the record is treated as "local-only" by the merge and comes
back.

**Fix:** Port the tombstone pattern from `services/mockData.ts` (see `deletedQueue`,
`addToDeletedQueue`, `removeFromDeletedQueue`, `flushDeletedQueue` near the top of
that file) into `crmService.ts`:
- On every CRM delete, add `{table, id}` to a persisted queue before the API call;
  remove on success or 404.
- In `reloadCRMFromApi`'s `mergeRemoteWithLocal`, drop records whose id is queued.
- Flush (retry) the queue at the start of `reloadCRMFromApi`.
Use a distinct localStorage key (e.g. `dreambox_crm_deleted_queue`).

**Verify:** existing tests pass; delete a CRM company with devtools offline, reload,
go online, reload again — it must not come back.

## Task 7 — MEDIUM: CRM records created offline are never pushed to the server

**File:** `services/crmService.ts` — `reloadCRMFromApi`

If the fire-and-forget sync in `syncRecordToApi` fails (offline, expired token), the
record lives only in that browser forever unless the user happens to edit it.

**Fix:** After Task 6's tombstones exist (required — otherwise this would resurrect
deletes), extend `reloadCRMFromApi`: for each local-only record surviving the merge
(id not in remote, not tombstoned), call `syncRecordToApi(key, record)` to push it.
Throttle/fire sequentially to avoid hammering; log failures with `logger.warn`.

**Verify:** create a CRM contact with the API blocked, unblock, trigger reload —
the contact must appear in the DB.

## Task 8 — MEDIUM: receipt→invoice link is a regex over description text

**Files:** `prisma/schema.prisma` (Invoice model), `services/mockData.ts`
(`linkedInvoiceIdOfReceipt`, receipt creation sites), `components/Financials.tsx`
(receipt-generation button, receipt create form), `lib/whitelist.ts` (`pickInvoiceData`)

Receipts reference their invoice only by parsing `Invoice #([A-Za-z0-9-]+)` out of
the first line-item description. Editing the description silently breaks payment
tracking (deleting the receipt then won't revert the invoice to Pending).

**Fix:**
1. Add optional `linkedInvoiceId String?` to the `Invoice` model; create a migration
   (`npx prisma migrate dev --name add-linked-invoice-id` — if no DB access, add the
   migration SQL file and note it must be applied).
2. Add `linkedInvoiceId` to `pickInvoiceData` in `lib/whitelist.ts` and to the zod
   schema in `api/invoices.ts`.
3. Set `linkedInvoiceId` everywhere receipts are created (grep `type: 'Receipt'`).
4. Change `linkedInvoiceIdOfReceipt` in `mockData.ts` to prefer the field and fall
   back to the regex for legacy rows.

**Verify:** generate a receipt for a paid invoice, edit the receipt description,
delete the receipt — the invoice must still revert to Pending.

## Task 9 — MEDIUM: remaining create forms lack double-submit guards

**Files:** `components/Rentals.tsx:339` (`handleCreateRental`),
`components/BillboardList.tsx`, `components/ClientList.tsx`, `components/Expenses.tsx`
(check each form's submit handler)

`Financials.tsx` got an `isSubmittingRef` guard; the other create forms still fire
one server create per click if the user double-clicks a slow submit.
(`ContractList.tsx:373` already has a `saving` state — it's fine.)

**Fix:** Apply the same pattern used in `components/Financials.tsx` `handleCreate`:
a `useRef(false)` guard set at entry, cleared in `finally`.

**Verify:** typecheck + rapid double-click a create button — one record.

## Task 10 — LOW: LED slot count corrupted by contract deletion

**File:** `services/mockData.ts` — `deleteContract` (~line 500)

The LED branch does `billboard.rentedSlots = rentedSlots - 1` blindly. If the
contract held multiple slots, or invoices also occupy slots, the count drifts. The
correct routine `recalcBillboardAvailability(billboardId)` already exists and is
used by `endContract`.

**Fix:** Replace the whole manual billboard-availability block in `deleteContract`
(both Static and LED branches) with a single
`recalcBillboardAvailability(contract.billboardId)` call placed **after** the
contract/invoice arrays are updated.

**Verify:** vitest passes (billboard availability tests exist).

## Task 11 — LOW: rate limiter has a check-then-act race

**File:** `lib/rateLimiter.ts`

`checkRateLimit` reads the row, then updates it. N concurrent requests can all read
`attempts < max` and pass, exceeding the limit.

**Fix:** Make the increment atomic: `prisma.rateLimit.update({ data: { attempts:
{ increment: 1 } } })` **first**, then decide from the returned row's `attempts`
value; handle the reset-window case with `updateMany({ where: { key, resetAt: { lt:
now } }, ... })` or wrap in `prisma.$transaction`. Keep the public signature.

**Verify:** existing behavior for the single-request path unchanged (signin still
works; `api/public-lead.ts` still rate-limits after 5 posts).

## Task 12 — LOW: sync failures are invisible to users

**Files:** `services/mockData.ts`, `services/crmService.ts` — every
`console.error('[...] API ... failed')` catch branch

The app's offline-first writes swallow server errors into the console. Users believe
data is saved when it only exists locally. There is a `components/ToastProvider.tsx`
already in the tree.

**Fix:** Add a lightweight notification hook: export a `onSyncError(cb)` registration
from `mockData.ts` (module-level callback list), invoke it in the catch branches with
a short human message ("Invoice saved locally — server sync failed, will retry"),
and register a toast display in `App.tsx`/`Layout.tsx` via the existing ToastProvider.
Do **not** turn these into thrown errors — the offline-first local save must proceed.

**Verify:** block the API in devtools, create an invoice — a toast appears, the
invoice still shows in the list.

---

## Order of work

1 → 2 → 3 → 4 → 5 (critical/high, independent) → 6 → 7 (7 depends on 6) → 8 → 9 → 10 → 11 → 12.

After each task: `npx tsc --noEmit && npx vitest run`. Commit per task with a
`fix:` prefix message. Do not push unless asked.
