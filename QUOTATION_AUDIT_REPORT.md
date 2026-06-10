# Quotation Creation Flow Audit — Dreambox Advertising System

**Audit Date:** 2026-06-10  
**Auditor:** System Code Review  
**Scope:** Full quotation lifecycle — create, save, edit, send, approve, convert, track  

---

## Executive Summary

The Dreambox app **does not have a true quotation system**. Quotations are implemented as `Invoice` records with `type: 'Quotation'` (single-table inheritance). They share the same database table, API endpoints, UI components, PDF templates, and status enum as invoices, receipts, and proformas. This creates significant UX confusion, data integrity risks, and gaps in business workflow.

**Verdict:** The current flow is functional for basic record-keeping but is **not ready for real business use** without a dedicated quotation module.

---

## 1. Current Quotation Workflow

### Where Quotations Are Created
- **Primary:** `Financials.tsx` tab bar → **Quotations** tab → "New Quotation" button. The creation modal is shared across all four financial document types.
- **Secondary:** `ClientDetail.tsx` → client profile page has a simplified invoice/quotation creation form.
- **Not available:** There is **no dedicated /quotations route** or standalone quotations page.

### Who Can Create Quotations
- **Any authenticated user** with an `Active` account status can create, edit, and send quotations.
- The `UserPermissions.invoices` field exists in the schema and Settings UI but is **never enforced** in the backend (`/api/invoices.ts`) or frontend (`Financials.tsx`).
- Only **delete** is restricted: `Admin`, `Manager`, or hardcoded email allowlist.

### Required Fields
- `clientId` (linked to `Client`)
- `date` (document date)
- `items` (JSON array — at least one required)
- `subtotal`, `total` (calculated client-side)
- `status` defaults to `Pending` (InvoiceStatus enum)
- `type` is forced to `Quotation` by the active tab

**Missing fields:** expiry date, terms & conditions, notes, contact person, quote-specific status, sent/accepted tracking.

### Adding Product/Service Items
Two methods exist inside the shared modal:
1. **Billboard picker:** Searchable list of all billboards. For Static: checkbox Side A / Side B. For LED: number input for slot count. Click "Add Selected to Line Items."
2. **Custom line item:** Textarea description + number input amount + "Add" button.

**Problems:**
- No saved product/service catalogue outside billboard inventory.
- No quick-add for common non-billboard services (design, printing, installation).
- Billboard picker is dense and scrolls inside a modal — awkward on mobile.
- Item descriptions are free-text; no preset service templates.

### Pricing / Discounts / VAT / Totals
All calculations happen **client-side** before API submission.

```
grossItems        = sum of all line item amounts
discountAmount    = min(grossItems, max(0, discountValue))
grossAfterDiscount = max(0, grossItems - discountAmount)
{subtotal, vat}   = hasVat ? splitInclusiveVat(grossAfterDiscount, vatRate) : {grossAfterDiscount, 0}
total             = grossAfterDiscount
```

- VAT is **inclusive** (extracted from gross), not added on top. Default rate: 15.5%.
- Discount can be fixed amount or percentage.
- Live summary card shows Subtotal, Discount, VAT, Total inside the modal.

**Problems:**
- No server-side recalculation or validation of totals — a malicious client could submit any numbers.
- No quantity × unit price field — only a flat `amount` per line item. Users must calculate unit prices manually.
- No line-item-level discounts.

### Editing After Creation
- ✅ Yes. Click Edit button on any quotation row → opens the shared modal pre-populated.
- Updates are saved via `PUT /api/invoices?id=`.
- No revision history or audit trail per quotation change.

### Quotation Numbering
- **No sequential numbering.**
- Generated client-side as `QT-${Date.now().toString().slice(-4)}` (or `-5` in `ClientDetail.tsx`).
- Example outputs: `QT-8247`, `QT-98247`.
- **Not unique** — collisions possible, though unlikely. Not sortable chronologically. Not professional.

---

## 2. User Experience Problems

### Confusing Screens, Modals, Buttons, Form Fields
| Issue | Location | Severity |
|-------|----------|----------|
| Shared modal for Invoice/Quotation/Proforma/Receipt | `Financials.tsx` | High — users must remember which tab they clicked to understand what they're creating |
| Plain HTML `<select>` for client dropdown | `Financials.tsx` | High — no search, unusable with 50+ clients |
| Billboard picker nested inside creation modal | `Financials.tsx` | Medium — scrolling inside modal is disorienting |
| No "Save as Draft" vs "Send" distinction | `Financials.tsx` | High — everything saves as `Pending`; no `Sent` status |
| Convert to Contract deletes the quotation | `Financials.tsx` | High — data loss, no trace of original quote |
| Status badges show `Pending` for unsent quotes | `Financials.tsx` | Medium — `Pending` looks like an invoice status, not a quote status |
| No preview before saving | `Financials.tsx` | Medium — users see only the form, not the final document |

### Too Many Steps
Current flow to create and send a quotation:
1. Navigate to Financials → Quotations tab
2. Click New Quotation
3. Select client from long dropdown
4. Pick date
5. Search billboards / enter custom items one by one
6. Apply discount (optional)
7. Toggle VAT
8. Click Create Quotation
9. Find the quotation in the table
10. Click Send Email
11. Compose email in modal
12. Click Send

**Ideal flow should be:** Select client → Add items → Preview → Save as Draft OR Send.

### Mobile Usability
| Issue | Severity |
|-------|----------|
| Table horizontal overflow (`min-w-[600px] lg:min-w-[800px]`) | Medium |
| Tabs overflow with hidden scrollbar | Low |
| Modal max-width `sm:max-w-2xl` feels cramped on phones | Medium |
| Billboard picker grid is dense with many touch targets | Medium |
| No card-based list view for quotations on mobile | Medium |
| Client dropdown is a native `<select>` — works but is unwieldy | Low |

### Duplicate Inputs / Unnecessary Fields
- `paymentMethod` and `paymentReference` are in the form state but irrelevant for quotations.
- The "Linked Rental" dropdown appears for all document types even though it's primarily for invoices.
- Status dropdown shows `Paid`, `Pending`, `Overdue` — only `Pending` makes sense for quotations.

---

## 3. Quotation Document Quality

### PDF Layout (`services/pdfGenerator.ts` / `lib/documentPdf.ts`)
- Reuses the **invoice PDF template** exactly. Only the header label changes to "QUOTATION".
- Includes: company logo (with smart palette extraction), company header, client block, date, status badge, line items table, subtotal/discount/VAT/total, payment details, footer.
- Uses jsPDF + autoTable on client side; pdfkit on server side for email attachments.

**Strengths:**
- Professional branding with logo and color adaptation.
- Clean table layout.
- Payment details / banking info included.

**Weaknesses:**
- No quotation-specific footer (e.g., "Valid until [date]").
- No terms & conditions block.
- No signature/acceptance area.
- Status badge shows `Pending` (red) — confusing for a new quotation.
- No "Prepared by" or sales agent name.

### Missing Status Labels
The system only has `Paid | Pending | Overdue`. A proper quotation workflow needs:
- **Draft** — being prepared, not yet sent
- **Sent** — emailed/WhatsApp'd to client
- **Accepted** — client approved
- **Rejected** — client declined
- **Expired** — past validity date
- **Converted** — turned into invoice or contract

---

## 4. Streamlining Improvements — Recommended New Flow

### Proposed Quotation Flow (5 Steps)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. SELECT/     │ →  │  2. ADD ITEMS   │ →  │  3. REVIEW &    │
│     CREATE      │    │    & PRICING    │    │    ADJUST       │
│     CLIENT      │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       ↓
┌─────────────────┐    ┌─────────────────┐
│  5. TRACK &     │ ←  │  4. SAVE/SEND   │
│     CONVERT     │    │                 │
└─────────────────┘    └─────────────────┘
```

**Step 1 — Select or Create Client**
- Searchable client autocomplete (not dropdown).
- One-click "+ New Client" mini-form if client doesn't exist.
- Auto-fill contact person, email, phone.

**Step 2 — Add Items & Pricing**
- Tab: "From Catalogue" / "Custom Line Item".
- Catalogue = saved services + billboard inventory.
- Auto-fill description, unit price when catalogue item selected.
- Quantity × Unit Price = Line Total (server-validated).
- Global discount (fixed or %) and line-item discounts.
- Auto-calculate subtotal, VAT, discount, total in real time.

**Step 3 — Review & Adjust**
- Side-by-side preview of the quotation as it will appear to the client.
- Editable terms & conditions textarea (with presets).
- Set expiry date (default: 30 days).
- Add internal notes (not shown on PDF).

**Step 4 — Save or Send**
- "Save as Draft" → status = Draft.
- "Send via Email" → opens email modal with pre-filled subject/body + PDF attachment.
- "Share via WhatsApp" → generates WhatsApp link with message + PDF.
- "Download PDF" → immediate download.
- On send → status auto-updates to Sent, `sentAt` timestamp recorded.

**Step 5 — Track & Convert**
- Dashboard shows quotation status pipeline.
- "Mark as Accepted" / "Mark as Rejected" buttons.
- "Convert to Invoice" → clones line items into new Invoice, preserves original quotation, links via `convertedToInvoiceId`.
- "Convert to Contract" → preserves original quotation, creates Contract, links via `convertedToContractId`.

---

## 5. Recommended Features (Gap Analysis)

| Feature | Current State | Priority |
|---------|--------------|----------|
| **Quotation templates** | ❌ Missing | High |
| **Saved product/service catalogue** | ❌ Missing (only billboard inventory) | High |
| **Client autofill** | ⚠️ Partial (only when linked to rental) | Medium |
| **Auto quotation numbering** | ❌ Random `QT-` prefix | High |
| **Duplicate quotation button** | ❌ Missing | Medium |
| **Convert to invoice button** | ❌ Only `convertInvoiceType` (in-place rename) | High |
| **WhatsApp share button** | ❌ Missing | Medium |
| **Email send button** | ✅ Exists (`SendDocumentModal`) | — |
| **PDF download button** | ✅ Exists | — |
| **Quotation expiry date** | ❌ Missing (hardcoded "30 days" in email only) | High |
| **Activity timeline** | ❌ Missing (only generic `audit_logs`) | Medium |
| **Approval/acceptance tracking** | ❌ Missing | High |
| **Search & filters (client, status, date, amount)** | ⚠️ Basic text search only | Medium |
| **Preset terms & notes** | ❌ Missing | Medium |
| **Quantity + unit price per line item** | ❌ Only flat `amount` | High |

---

## 6. Dashboard Improvements

### Current State
No quotations dashboard exists. Quotations are shown in a shared table under Financials → Quotations with basic text search.

### Recommended Quotations Dashboard
A dedicated `/quotations` page (or enhanced Financials tab) with:

**KPI Cards (top row):**
- Total Quotations Created (this month / all time)
- Draft Quotations
- Sent Quotations
- Accepted Quotations
- Rejected / Expired Quotations
- Total Quoted Value
- Conversion Rate (accepted ÷ sent)

**Charts:**
- Quotation status pipeline (funnel: Draft → Sent → Accepted / Rejected)
- Quotation value trend line (monthly)
- Top clients by quoted value

**Activity Feed:**
- Recent quotation activity (created, sent, viewed, accepted, converted)
- "Quotation #QT-00123 sent to Acme Corp 10 minutes ago"

**List View:**
- Filter by: status, client, date range, amount range
- Sort by: date, amount, expiry date
- Quick actions per row: View / Edit / Send / Duplicate / Convert / Delete

---

## 7. Role and Permission Audit

### Current Permissions
| Action | Who Can Do It | Enforcement |
|--------|--------------|-------------|
| Create quotation | Any authenticated active user | `requireAuth()` only |
| Edit quotation | Any authenticated active user | `requireAuth()` only |
| Delete quotation | Admin, Manager, email allowlist | `requireDeletePermission()` |
| Send quotation email | Any authenticated active user | `requireAuth()` only |
| Convert to contract | Any authenticated active user | Client-side only |
| View financial values | Any authenticated active user | No restrictions |
| Approve/convert | Any authenticated active user | No restrictions |

### Critical Gaps
1. **`UserPermissions.invoices` is never enforced.** A Staff user with `invoices: 'read'` can still create, edit, and send quotations.
2. **No quotation-specific permission.** You cannot grant quote creation without invoice creation.
3. **No approval workflow.** Any user can mark a quote as accepted or convert it.
4. **No view restrictions on financial values.** All users see all totals.
5. **JWT does not include `permissions`.** Backend would need a DB lookup to enforce granular permissions.

### Recommended Permission Matrix
| Role | Create | Edit Own | Edit All | Delete | Send | Approve/Convert | View Values |
|------|--------|----------|----------|--------|------|-----------------|-------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Staff | ❌ | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sales Agent | ✅ | ✅ (own) | ❌ | ❌ | ✅ | ❌ | ✅ |

---

## 8. Final Output

### A. List of Current Problems
1. Quotations are not first-class entities — they are invoice records with a type flag.
2. No sequential, professional quotation numbering.
3. No quotation-specific status workflow (Draft → Sent → Accepted → Rejected → Expired → Converted).
4. No expiry date tracking — "30 days" is hardcoded in email copy only.
5. No convert-to-invoice workflow (only an in-place type rename).
6. Convert-to-contract **deletes** the original quotation (data loss).
7. No activity timeline or audit trail for quotation lifecycle events.
8. No saved product/service catalogue for quick item selection.
9. No quantity × unit price structure — only flat amounts.
10. `UserPermissions.invoices` exists in DB and UI but is completely unenforced.
11. Client dropdown is a plain `<select>` — unusable at scale.
12. Shared modal for all financial documents causes confusion.
13. No preview before saving/sending.
14. No WhatsApp sharing.
15. No duplication feature.
16. Table layout on mobile requires horizontal scrolling.
17. Server does not validate calculated totals — trust-based client-side math.

### B. UX Issues
| Issue | Impact |
|-------|--------|
| Shared Invoice/Quotation modal | Users accidentally create wrong document type |
| Plain client `<select>` | Slow and error-prone with many clients |
| `Pending` status for unsent quotes | Looks like an invoice status; confusing |
| No "Save as Draft" | Users must finish and send in one go |
| Convert deletes quotation | Users lose historical quote data |
| No preview | Users can't verify appearance before sending |
| Mobile table overflow | Poor experience on phones |

### C. Technical / Data Issues
| Issue | Risk |
|-------|------|
| Client-side price calculation only | Data integrity — malicious submissions possible |
| JSON `items` array with no schema validation | Corrupt line items possible |
| No unique constraint on quotation numbers | Collisions, duplicate references |
| No foreign key from quotation to invoice/contract | Cannot trace conversion history |
| `InvoiceStatus` enum shared across all document types | Semantically wrong for quotations |
| `permissions` JSON column unenforced | Security theater — users think it's enforced |
| Hardcoded email allowlist for delete | Maintenance risk, inconsistency |

### D. Recommended New Quotation Flow
See Section 4 above.

### E. Database / Schema Improvements

**Option A: Minimal (Extend Invoice Model)**
Add fields to existing `Invoice` model:
```prisma
model Invoice {
  // ... existing fields ...
  expiryDate          String?       // ISO date for quote validity
  terms               String?       // Terms & conditions
  notes               String?       // Internal notes
  sentAt              DateTime?     // When emailed/WhatsApp'd
  sentTo              String?       // Email/phone sent to
  viewedAt            DateTime?     // Client viewed (future)
  quoteStatus         QuoteStatus?  @default(Draft)
  convertedToInvoiceId String?
  convertedToContractId String?
  convertedAt         DateTime?
  createdBy           String        // User who created it
  assignedTo          String?       // Sales agent
}

enum QuoteStatus {
  Draft
  Sent
  Accepted
  Rejected
  Expired
  Converted
}
```

**Option B: Proper (Dedicated Quotation Model)** — **Recommended for scale**
```prisma
model Quotation {
  id            String        @id @default(uuid())
  quoteNumber   String        @unique
  clientId      String
  contactName   String?
  contactEmail  String?
  date          String
  expiryDate    String?
  items         Json
  subtotal      Float
  discountAmount Float?
  discountDescription String?
  vatAmount     Float
  total         Float
  status        QuoteStatus   @default(Draft)
  terms         String?
  notes         String?
  sentAt        DateTime?
  sentTo        String?
  viewedAt      DateTime?
  acceptedAt    DateTime?
  acceptedBy    String?
  rejectedAt    DateTime?
  rejectedReason String?
  convertedToInvoiceId String?
  convertedToContractId String?
  convertedAt   DateTime?
  createdBy     String
  assignedTo    String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([clientId])
  @@index([status])
  @@index([createdBy])
  @@map("quotations")
}
```

**Additional tables needed:**
```prisma
model ProductService {
  id          String  @id @default(uuid())
  name        String
  description String?
  unitPrice   Float
  category    String  // 'billboard', 'design', 'printing', 'installation', 'other'
  isActive    Boolean @default(true)
}

model QuotationEvent {
  id          String   @id @default(uuid())
  quotationId String
  type        String   // 'created', 'sent', 'viewed', 'accepted', 'rejected', 'converted', 'edited'
  actorId     String
  details     String?
  createdAt   DateTime @default(now())
  @@index([quotationId])
}
```

### F. UI Refactor Recommendations
1. **Create a dedicated `/quotations` route** with its own page component.
2. **Replace shared modal** with a quotation-specific wizard (3-step: Client → Items → Review).
3. **Client search autocomplete** — replace `<select>` with a searchable combobox.
4. **Add "Save as Draft" primary action** alongside "Send Quotation."
5. **Add preview pane** in the creation flow — show live PDF preview.
6. **Card-based mobile layout** — replace table with cards on `< lg` breakpoints.
7. **Add action buttons per quotation:** Duplicate, Convert to Invoice, Share WhatsApp, Send Email, Download PDF.
8. **Status badges with quotation colors:** Draft (gray), Sent (blue), Accepted (green), Rejected (red), Expired (orange), Converted (purple).
9. **Add expiry date picker** with visual warning for expired quotes.
10. **Activity timeline panel** on quotation detail view.

### G. Mobile-First Improvements
1. **Card list instead of table** on small screens:
   ```tsx
   <div className="lg:hidden grid grid-cols-1 gap-4">
     {quotes.map(q => <QuotationCard key={q.id} {...q} />)}
   </div>
   <div className="hidden lg:block">
     {/* existing table */}
   </div>
   ```
2. **Full-screen modal on mobile** (`fixed inset-0`) instead of centered `sm:max-w-2xl`.
3. **Bottom sheet** for item picker instead of nested modal scrolling.
4. **Touch targets ≥ 44px** for all primary actions.
5. **Simplified creation flow** for mobile: one section at a time, not all fields visible at once.

### H. Priority List

#### 🔴 Urgent (Fix This Week)
| # | Item | Reason |
|---|------|--------|
| 1 | Add `QuoteStatus` enum and migration | Current `Pending` status is semantically wrong and confusing |
| 2 | Auto-generate sequential quote numbers | Professional appearance; traceability |
| 3 | Add `expiryDate` field | Business requirement; currently hardcoded only in email |
| 4 | Fix convert-to-contract to preserve quotation | Data loss is unacceptable |
| 5 | Enforce `UserPermissions.invoices` (or create `quotes` permission) | Security gap — any user can create/modify |
| 6 | Server-side validation of totals | Prevent data corruption |

#### 🟠 Important (This Sprint)
| # | Item | Reason |
|---|------|--------|
| 7 | Create dedicated `/quotations` page | Separation of concerns; better UX |
| 8 | Add searchable client combobox | Usability at scale |
| 9 | Add "Save as Draft" vs "Send" distinction | Proper workflow |
| 10 | Build convert-to-invoice flow (clone, don't rename) | Core business requirement |
| 11 | Add quotation KPI dashboard | Visibility for sales team |
| 12 | Add quantity × unit price to line items | Proper itemization |
| 13 | Add WhatsApp share button | Common sales channel |
| 14 | Add duplicate quotation button | Saves time on repeat quotes |

#### 🟡 Future Improvements (Next Quarter)
| # | Item | Reason |
|---|------|--------|
| 15 | Product/service catalogue | Faster item entry |
| 16 | Quotation templates | Faster creation for common quote types |
| 17 | Activity timeline per quotation | Audit and sales tracking |
| 18 | Client portal quotation view | Self-service acceptance |
| 19 | E-signature integration | Formal acceptance workflow |
| 20 | Automated expiry reminders | Follow-up automation |
| 21 | Conversion rate analytics | Business intelligence |
| 22 | Mobile card-based layout | Better mobile UX |

---

## Conclusion

The Dreambox quotation system is **architecturally simple but functionally incomplete** for real business use. The single-table inheritance approach (quotations = invoices with a type flag) has created cascading problems: wrong statuses, no lifecycle tracking, no conversion history, confusing UX, and missing permissions.

**The highest-impact fixes are:**
1. Introduce quotation-specific statuses and an expiry date.
2. Stop deleting quotations when converting to contracts.
3. Add proper sequential numbering.
4. Enforce role-based permissions.
5. Build a dedicated quotation creation flow with preview and save-as-draft.

With these changes, the quotation module will be fast, professional, easy to understand, and ready for real sales workflows.
