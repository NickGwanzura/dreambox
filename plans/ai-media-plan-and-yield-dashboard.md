# AI Media-Plan Builder and Pricing and Yield Dashboard

Status: proposal, not implemented.

Two features that reuse data and flows Dreambox already has: billboards, contracts, invoices, profit analytics, the Groq proxy (`api/ai.ts`) and the quotation flow.

---

## 1. AI Media-Plan Builder

### Goal
A salesperson enters a **budget, town, goal and duration**. The system proposes a mix of available sites, explains why, and turns the plan into a draft quotation in one click.

### User flow
1. In **Quotations**, click **AI Media Plan**.
2. Enter:
   - Monthly budget (USD)
   - Town (or "any")
   - Goal: *Brand awareness*, *Cost efficiency*, *Digital impact* or *Balanced*
   - Duration in months
   - Optional: max number of sites
3. The system returns a ranked plan: sites and sides or slots, monthly cost, estimated daily impressions and cost per thousand (CPM), and a short AI rationale per site.
4. The user removes or swaps lines, picks a client (or adds one quickly), then clicks **Create Quotation**.
5. A draft quotation is created with the plan lines, VAT and expiry applied as in the normal quotation form.

### Design: deterministic core, AI for explanation
The site selection is **deterministic code**, so budgets are never exceeded and unavailable sites are never proposed. The AI only writes the rationale and summary. If the AI call fails, a template rationale is used and the feature still works.

**Candidate units** (what can be sold):
- Static board: Side A and Side B, each priced separately.
- LED board: one slot, with the number of free slots counted.
- Excluded: sides or slots under active contract, sides marked `Maintenance` or `Rented`, and units with no rate.

**Scoring per unit** (each factor normalised 0 to 1):

| Factor | Source |
| --- | --- |
| Traffic | `Billboard.dailyTraffic` |
| Efficiency | traffic per dollar of monthly rate |
| Proven demand | trailing 12-month occupancy of the site (reuses yield analytics) |
| Size / impact | board area (`width * height`) |
| Digital fit | LED type flag |

**Goal weights** (example):

| Goal | Traffic | Efficiency | Demand | Size | Digital |
| --- | --- | --- | --- | --- | --- |
| Brand awareness | 0.45 | 0.10 | 0.15 | 0.25 | 0.05 |
| Cost efficiency | 0.15 | 0.55 | 0.15 | 0.05 | 0.10 |
| Digital impact | 0.20 | 0.15 | 0.10 | 0.05 | 0.50 |
| Balanced | 0.30 | 0.25 | 0.20 | 0.15 | 0.10 |

**Selection:** greedy by score under the budget, one unit per board first to spread coverage, then a second pass to fill the remaining budget. If the town has too little available inventory, widen to nearby towns and tell the user.

**Outputs per plan:**
- Total monthly cost, total over the duration, budget used %
- Estimated daily impressions (sum of `dailyTraffic` of selected sites)
- CPM = monthly cost / (daily impressions x 30) x 1000
- Warnings: low inventory, widened to other towns, missing traffic data

### AI part
Add `generateMediaPlanNarrative(ctx)` to [services/aiService.ts](../services/aiService.ts), using the existing `callAI` proxy. Input is the already-chosen plan (not the whole database). Output is a short summary and one-line reason per site. The prompt must forbid inventing numbers: every figure comes from the plan.

### Files
| File | Change |
| --- | --- |
| `services/mediaPlan.ts` (new) | candidate building, scoring, selection (pure, no AI) |
| `services/aiService.ts` | add `generateMediaPlanNarrative` |
| `components/quotations/MediaPlanBuilder.tsx` (new) | modal UI |
| `components/Quotations.tsx` | "AI Media Plan" button, refresh list after create |
| `tests/media-plan.test.ts` (new) | selection rules |

### Creating the quotation
Reuse the same shape as `handleCreate` in `Quotations.tsx`:
- items: `{ description, amount, billboardId, side | slots }`, where amount is monthly rate x duration and the description states the months and monthly rate
- totals via `splitInclusiveVat` and `getEffectiveVatRate`
- `type: 'Quotation'`, `quoteStatus: Draft`, expiry date (default 14 days)
- gated by `canCreateQuotations`
- the server assigns `id` and `quoteNumber`, as it does today

### Tests
- Never exceeds budget.
- Never includes a booked side or an LED board with no free slots.
- Respects the town filter and warns when it widens.
- Same input gives the same plan (deterministic).
- Different goals change the ranking.
- AI failure still returns a usable plan.

### Risks and open questions
- `dailyTraffic` is often a manual or AI estimate, so some boards may have none. Decide a default: skip, or score as median.
- Should the plan let a client buy both sides of one board? (Proposed: allowed in the second pass.)
- Should multi-site quotes get an automatic volume discount? Out of scope for v1.

---

## 2. Pricing and Yield Dashboard

### Goal
Show, for every site, how well it earns: **occupancy, revenue, cost, margin**, and flag **underpriced** and **chronically empty** sites with a concrete suggested rate.

### New page
A new **Yield** page under the **Insights** nav group (Admin and Manager), next to Profit and Analytics. Wired in [App.tsx](../App.tsx) and [components/Layout.tsx](../components/Layout.tsx).

### Metrics per site

| Metric | Definition |
| --- | --- |
| Capacity | 2 for Static (Side A + B), `totalSlots` for LED |
| Current occupancy | occupied units today / capacity |
| Trailing 12-month occupancy | occupied unit-months in the last 12 months / (capacity x 12), from contract date ranges |
| Potential MRR | sum of rate card across all units |
| Current MRR | sum of `monthlyRate` of active contracts |
| Yield % | current MRR / potential MRR |
| Realised revenue, direct cost, margin | existing `getBillboardProfitability()` |
| Rate per sqm | static side rate / board area, compared with peers |

Unit counting for a contract: side `Both` = 2 units, side `A` or `B` = 1, LED slot = 1. Only `Active` and `Expired` contracts count; `Pending` does not.

### Flags and suggestions (rules, not AI)

| Flag | Rule | Suggestion |
| --- | --- | --- |
| Underpriced | trailing occupancy >= 80% and rate per sqm (or per slot) at least 15% below peer median | raise toward the median, capped at +15% per step |
| Hard to fill | trailing occupancy < 40% or vacant for 3+ months | discount of 10 to 20%, or a short-term promotion |
| Overpriced | low occupancy and rate above peer median | lower toward the median |
| Drop candidate | trailing occupancy < 25% and margin <= 0 | review: relocate, sell or retire |
| Healthy | none of the above | no change |

Peers are boards of the same type, in the same town when there are at least 3 of them, otherwise network-wide. Each suggestion shows the new rate and the estimated monthly effect (for example "+$40/mo per side if occupancy holds").

### Dashboard layout
- **KPI row:** network occupancy, yield %, average rate per sqm, number of flagged sites, potential uplift.
- **Table:** one row per site with the metrics above, flag badge, suggested rate, sortable and filterable by flag, town and type.
- **Charts** (Recharts, already a dependency): occupancy versus rate scatter (quadrants: underpriced, healthy, overpriced, hard to fill), and a top and bottom 10 by margin.
- Optional "Ask AI" button: send the top flagged sites to the existing BI analysis call for a short commentary. Not required for the numbers.

### Files
| File | Change |
| --- | --- |
| `services/yieldAnalytics.ts` (new) | pure metric and flag functions |
| `components/YieldDashboard.tsx` (new) | page UI |
| `App.tsx` | `case 'yield'` route |
| `components/Layout.tsx` | nav entry in Insights |
| `tests/yield-analytics.test.ts` (new) | metric and flag rules |

`yieldAnalytics.ts` takes billboards and contracts as arguments, so tests don't need the data store. A thin wrapper supplies live data from `mockData`. The media-plan builder also imports the occupancy function from here.

### Tests
- Occupancy for static sides, `Both`, and LED slots.
- Trailing window clips contracts that start or end outside it.
- Each flag fires only when its rule is met, and boundaries are covered.
- Peer median fallback when fewer than 3 same-town peers exist.
- Boards with no contracts, no rate or no dimensions don't crash.

### Risks and open questions
- Cost data comes from existing attribution (contract install, print and production costs plus linked expenses). Site running costs such as rent and electricity are not recorded per site, so margin overstates profit. Consider adding a monthly site cost field later.
- Thresholds (80%, 40%, 15%) are starting points. Put them in one constants object so the owners can tune them.
- Suggestions are advice only. The page never changes rates automatically.

---

## Build order
1. `yieldAnalytics.ts` and its tests (the media plan depends on the occupancy function).
2. Yield page and nav wiring.
3. `mediaPlan.ts` and its tests.
4. AI narrative function and the builder modal.
5. Hook into Quotations and test the full flow end to end.

Estimated size: about 2 to 3 days for both, most of it UI and tests.
