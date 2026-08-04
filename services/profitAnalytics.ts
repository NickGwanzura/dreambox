/**
 * Profit & Analytics helpers.
 *
 * Revenue in this module is always realised invoice revenue: non-voided
 * documents whose type is `Invoice`.  Contract monthly rates are retained as
 * a forecast/MRR metric only; they are never multiplied by a term when
 * calculating realised profitability.
 *
 * Direct costs are conservative and attributable:
 *   - installationCost + printingCost + productionCost on a Contract;
 *   - printing jobs linked to a billboard only for the portion not already
 *     represented by that billboard's recorded contract printing costs;
 *   - operating expenses linked to a contract (attributed to its campaign)
 *     or to a client only (attributed to the client row).
 *
 * Jobs without a billboard (or with an unknown billboard) and operating
 * expenses with no client/contract linkage are reported separately instead
 * of being allocated to a contract, billboard, or client.
 */

import {
    getContracts,
    getInvoices,
    getExpenses,
    getPrintingJobs,
    getOutsourcedBillboards,
    getBillboards,
    getClients,
} from './mockData';
import { Invoice, Contract } from '../types';

// ============================================
// SHARED HELPERS
// ============================================

const isInvoice = (invoice: Invoice): boolean =>
    String(invoice.type || '').toLowerCase() === 'invoice' && !invoice.isVoided;

const numeric = (value: unknown): number => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
};

const realisedInvoices = (): Invoice[] => getInvoices().filter(isInvoice);

// Keep analytics usable with older/offline mock-data adapters that predate
// these two getters.  The production adapter exports both; the fallback keeps
// a partial test fixture from crashing the whole analytics page.
const printingJobsForAnalytics = () => typeof getPrintingJobs === 'function' ? getPrintingJobs() : [];
const outsourcedBillboardsForAnalytics = () => typeof getOutsourcedBillboards === 'function' ? getOutsourcedBillboards() : [];

const contractDirectCost = (contract: {
    installationCost?: number;
    printingCost?: number;
    productionCost?: number;
}): number =>
    numeric(contract.installationCost) + numeric(contract.printingCost) + numeric(contract.productionCost);

const margin = (revenue: number, directCosts: number): number =>
    revenue > 0 ? ((revenue - directCosts) / revenue) * 100 : 0;

/**
 * Split an invoice total into recurring vs one-time portions.
 *
 * Invoice items are not explicitly typed in the data model, so matching
 * one-time descriptions is the least surprising deterministic split.  Amounts
 * are net of VAT (the subtotal), preserving the historical function contract.
 */
export function classifyInvoiceRevenue(invoice: Invoice): { recurring: number; oneTime: number } {
    const netRevenue = numeric(invoice.subtotal);
    const gross = numeric(invoice.total);
    const netFactor = gross > 0 ? netRevenue / gross : 1;
    const oneTimeGross = (invoice.items || [])
        .filter(item => /install|print|production|setup|once-off|one-time/i.test(item.description || ''))
        .reduce((sum, item) => sum + numeric(item.amount), 0);
    const oneTime = Math.min(netRevenue, Math.max(0, oneTimeGross * netFactor));
    return { recurring: Math.max(0, netRevenue - oneTime), oneTime };
}

// ============================================
// REVENUE CLASSIFICATION
// ============================================

/** Calculate the current recurring run-rate (a forecast, not realised revenue). */
export function getTotalMonthlyRecurringRevenue(): number {
    const today = new Date();
    return getContracts()
        .filter(c => c.status === 'Active' && new Date(c.startDate) <= today && new Date(c.endDate) >= today)
        .reduce((sum, c) => sum + numeric(c.monthlyRate), 0);
}

/** Sum realised one-time invoice line items (net of VAT, voided invoices excluded). */
export function getTotalOneTimeRevenue(): number {
    return realisedInvoices().reduce((total, invoice) => total + classifyInvoiceRevenue(invoice).oneTime, 0);
}

// ============================================
// ATTRIBUTION LEDGER
// ============================================

interface PrintingAttribution {
    /** Printing job costs attributable to a billboard after recorded-cost cap. */
    supplementalByBillboard: Map<string, number>;
    /** Costs that cannot be deterministically attributed to a billboard. */
    unallocatedPrintingJobCosts: number;
    /** Raw job costs by client, useful for transparent client detail. */
    rawByClient: Map<string, number>;
}

const buildPrintingAttribution = (contracts = getContracts()): PrintingAttribution => {
    const recordedPrintingByBillboard = new Map<string, number>();
    for (const contract of contracts) {
        if (!contract.billboardId) continue;
        recordedPrintingByBillboard.set(
            contract.billboardId,
            (recordedPrintingByBillboard.get(contract.billboardId) || 0) + numeric(contract.printingCost),
        );
    }

    const jobsByBillboard = new Map<string, number>();
    const rawByClient = new Map<string, number>();
    let unallocatedPrintingJobCosts = 0;
    for (const job of printingJobsForAnalytics()) {
        const cost = numeric(job.totalCost);
        if (job.clientId) rawByClient.set(job.clientId, (rawByClient.get(job.clientId) || 0) + cost);
        if (!job.billboardId) {
            // Client-only jobs cannot be assigned to one placement without an
            // arbitrary policy, so keep them visible as unallocated.
            unallocatedPrintingJobCosts += cost;
            continue;
        }
        jobsByBillboard.set(job.billboardId, (jobsByBillboard.get(job.billboardId) || 0) + cost);
    }

    const knownBillboardIds = new Set(getBillboards().map(b => b.id));
    const supplementalByBillboard = new Map<string, number>();
    for (const [billboardId, jobTotal] of jobsByBillboard) {
        if (!knownBillboardIds.has(billboardId)) {
            unallocatedPrintingJobCosts += jobTotal;
            continue;
        }
        // Contract printing costs are recorded already.  Only excess jobs are
        // added as supplemental billboard costs, preventing double counting.
        // A billboard with no contract cannot be tied to a campaign, so its
        // job costs stay unallocated and visible in the summary instead of
        // breaking the billboard/campaign reconciliation.
        if (!recordedPrintingByBillboard.has(billboardId)) {
            unallocatedPrintingJobCosts += jobTotal;
            continue;
        }
        const recorded = recordedPrintingByBillboard.get(billboardId) || 0;
        supplementalByBillboard.set(billboardId, Math.max(0, jobTotal - recorded));
    }

    return { supplementalByBillboard, unallocatedPrintingJobCosts, rawByClient };
};

/**
 * Allocate each billboard's supplemental printing cost across its campaigns.
 *
 * The share is proportional to the contract's recorded printing cost, or split
 * evenly when no campaign records printing costs. Allocated shares sum to the
 * billboard's supplemental cost, so campaign totals reconcile with billboard
 * totals and roll up to clients unchanged.
 */
function allocateSupplementalPrinting(contracts = getContracts()): Map<string, number> {
    const printing = buildPrintingAttribution(contracts);
    const contractsByBillboard = new Map<string, Contract[]>();
    for (const contract of contracts) {
        if (!contract.billboardId) continue;
        const list = contractsByBillboard.get(contract.billboardId) || [];
        list.push(contract);
        contractsByBillboard.set(contract.billboardId, list);
    }

    const allocated = new Map<string, number>();
    for (const [billboardId, billboardContracts] of contractsByBillboard) {
        const supplemental = printing.supplementalByBillboard.get(billboardId) || 0;
        if (supplemental <= 0) continue;
        const recordedTotal = billboardContracts.reduce((sum, contract) => sum + numeric(contract.printingCost), 0);
        if (recordedTotal > 0) {
            for (const contract of billboardContracts) {
                allocated.set(contract.id, supplemental * (numeric(contract.printingCost) / recordedTotal));
            }
        } else {
            const share = supplemental / billboardContracts.length;
            for (const contract of billboardContracts) {
                allocated.set(contract.id, share);
            }
        }
    }
    return allocated;
}

// ============================================
// EXPENSE ATTRIBUTION
// ============================================

interface ExpenseAttribution {
    /** Operating expenses linked to a known contract (by contractId). */
    contractLinked: Map<string, number>;
    /** Operating expenses linked only to a client (clientId without a contract). */
    clientLinked: Map<string, number>;
    /** Ordinary expenses with no linkage at all. */
    unallocatedExpenseTotal: number;
}

/**
 * Split operating expenses by their optional client/contract linkage.
 *
 * A contract-linked expense belongs to that campaign (and rolls up to its
 * client and billboard). A client-only expense belongs to the client row.
 * Unknown/legacy contract ids fall back to the client when possible, so an
 * orphan link never silently vanishes from the summary.
 */
const buildExpenseAttribution = (contracts = getContracts()): ExpenseAttribution => {
    const knownContractIds = new Set(contracts.map(contract => contract.id));
    const contractLinked = new Map<string, number>();
    const clientLinked = new Map<string, number>();
    let unallocatedExpenseTotal = 0;

    for (const expense of getExpenses()) {
        const amount = numeric(expense.amount);
        if (expense.contractId && knownContractIds.has(expense.contractId)) {
            contractLinked.set(expense.contractId, (contractLinked.get(expense.contractId) || 0) + amount);
        } else if (expense.clientId) {
            clientLinked.set(expense.clientId, (clientLinked.get(expense.clientId) || 0) + amount);
        } else {
            unallocatedExpenseTotal += amount;
        }
    }
    return { contractLinked, clientLinked, unallocatedExpenseTotal };
};

// ============================================
// SUMMARY / COSTS
// ============================================

export interface ProfitabilitySummary {
    /** Realised net invoice revenue (all non-voided Invoice documents). */
    realizedRevenue: number;
    /** Recorded contract costs plus conservatively attributable job excess. */
    attributedDirectCosts: number;
    grossProfit: number;
    grossMargin: number;
    /** Expenses not assigned to a contract/billboard/client. */
    unallocatedOperatingExpenses: number;
    netProfit: number;
    contractRevenue: number;
    unlinkedInvoiceRevenue: number;
    recordedContractCosts: number;
    attributedPrintingJobCosts: number;
    /** Operating expenses linked to a contract (attributed to its campaign). */
    contractLinkedExpenses: number;
    /** Operating expenses linked only to a client (client-row attribution). */
    clientLinkedExpenses: number;
    unallocatedPrintingJobCosts: number;
    /** All costs kept outside contract/billboard attribution. */
    unallocatedCosts: number;
    invoiceCount: number;
    contractCount: number;

    // Compatibility aliases used by older consumers.
    revenue: number;
    cogs: number;
    directCosts: number;
    operatingExpenses: number;
    attributedDirectCost: number;
    unallocatedExpenses: number;
}

/**
 * Build the top-level attribution summary.  Outsourced payouts are not
 * contract costs, so they remain unallocated operating expense alongside the
 * unlinked Expense records (expenses tied to a client/contract are attributed).
 */
export function getProfitabilitySummary(): ProfitabilitySummary {
    const contracts = getContracts();
    const invoices = realisedInvoices();
    const printing = buildPrintingAttribution(contracts);
    const expenses = buildExpenseAttribution(contracts);
    const recordedContractCosts = contracts.reduce((sum, contract) => sum + contractDirectCost(contract), 0);
    const attributedPrintingJobCosts = Array.from(printing.supplementalByBillboard.values())
        .reduce((sum, value) => sum + value, 0);
    const contractLinkedExpenses = Array.from(expenses.contractLinked.values())
        .reduce((sum, value) => sum + value, 0);
    const clientLinkedExpenses = Array.from(expenses.clientLinked.values())
        .reduce((sum, value) => sum + value, 0);
    const attributedDirectCosts = recordedContractCosts + attributedPrintingJobCosts + contractLinkedExpenses + clientLinkedExpenses;
    const realizedRevenue = invoices.reduce((sum, invoice) => sum + numeric(invoice.subtotal), 0);
    const contractIds = new Set(contracts.map(contract => contract.id));
    const contractRevenue = invoices
        .filter(invoice => !!invoice.contractId && contractIds.has(invoice.contractId))
        .reduce((sum, invoice) => sum + numeric(invoice.subtotal), 0);
    const unlinkedInvoiceRevenue = realizedRevenue - contractRevenue;
    // Only expenses with no client/contract linkage remain operating costs;
    // linked expenses moved into the attribution ledger above.
    const ordinaryOperatingExpenses = expenses.unallocatedExpenseTotal;
    const outsourcedOperatingExpenses = outsourcedBillboardsForAnalytics().reduce((sum, billboard) => {
        const start = new Date(billboard.contractStart);
        const end = new Date(billboard.contractEnd);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return sum;
        const months = Math.max(
            1,
            (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1,
        );
        return sum + numeric(billboard.monthlyPayout) * months;
    }, 0);
    const unallocatedOperatingExpenses = ordinaryOperatingExpenses + outsourcedOperatingExpenses;
    const unallocatedCosts = unallocatedOperatingExpenses + printing.unallocatedPrintingJobCosts;
    const grossProfit = realizedRevenue - attributedDirectCosts;
    const netProfit = grossProfit - unallocatedOperatingExpenses;

    return {
        realizedRevenue,
        attributedDirectCosts,
        grossProfit,
        grossMargin: margin(realizedRevenue, attributedDirectCosts),
        unallocatedOperatingExpenses,
        netProfit,
        contractRevenue,
        unlinkedInvoiceRevenue,
        recordedContractCosts,
        attributedPrintingJobCosts,
        contractLinkedExpenses,
        clientLinkedExpenses,
        unallocatedPrintingJobCosts: printing.unallocatedPrintingJobCosts,
        unallocatedCosts,
        invoiceCount: invoices.length,
        contractCount: contracts.length,
        revenue: realizedRevenue,
        cogs: attributedDirectCosts,
        directCosts: attributedDirectCosts,
        operatingExpenses: unallocatedOperatingExpenses,
        attributedDirectCost: attributedDirectCosts,
        unallocatedExpenses: unallocatedOperatingExpenses,
    };
}

/** Explicit alias for callers that prefer cost-focused naming. */
export const getAttributionSummary = getProfitabilitySummary;
export const getDirectCostSummary = getProfitabilitySummary;

/**
 * Total attributable COGS.  Unallocated operating expenses are intentionally
 * excluded and available through getProfitabilitySummary().
 */
export function getTotalCOGS(): number {
    return getProfitabilitySummary().attributedDirectCosts;
}

export function getGrossProfit(): { grossProfit: number; grossMargin: number; revenue: number } {
    const summary = getProfitabilitySummary();
    return {
        grossProfit: summary.grossProfit,
        grossMargin: summary.grossMargin,
        revenue: summary.realizedRevenue,
    };
}

/** Gross profit less unallocated operating expenses. */
export function getNetProfit(): number {
    return getProfitabilitySummary().netProfit;
}

// ============================================
// PER-BILLBOARD PROFITABILITY
// ============================================

export interface BillboardProfitability {
    billboardId: string;
    billboardName: string;
    revenue: number;
    /** Compatibility alias for revenue. */
    realizedRevenue: number;
    totalRevenue: number;
    cogs: number;
    directCosts: number;
    attributedDirectCosts: number;
    recordedContractCosts: number;
    supplementalPrintingCost: number;
    /** Operating expenses linked to this billboard's campaigns. */
    linkedExpenseCost: number;
    printingJobCosts: number;
    supplementalDirectCosts: number;
    grossProfit: number;
    grossMargin: number;
    contractCount: number;
    invoiceCount: number;
}

/** Sentinel clientId for invoices that carry no client reference. */
export const UNASSIGNED_CLIENT_ID = 'unassigned';

export function getBillboardProfitability(): BillboardProfitability[] {
    const billboards = getBillboards();
    const contracts = getContracts();
    const invoices = realisedInvoices();
    const printing = buildPrintingAttribution(contracts);
    const expenses = buildExpenseAttribution(contracts);
    const knownBillboardIds = new Set(billboards.map(billboard => billboard.id));
    const billboardIds = billboards.map(billboard => billboard.id);
    // Preserve attribution when a contract references a billboard that has
    // since been removed from the inventory list.
    for (const contract of contracts) {
        if (contract.billboardId && !knownBillboardIds.has(contract.billboardId)) {
            knownBillboardIds.add(contract.billboardId);
            billboardIds.push(contract.billboardId);
        }
    }

    return billboardIds.map(billboardId => {
        const billboard = billboards.find(item => item.id === billboardId);
        const billboardContracts = contracts.filter(contract => contract.billboardId === billboardId);
        const contractIds = new Set(billboardContracts.map(contract => contract.id));
        const billboardInvoices = invoices.filter(invoice => !!invoice.contractId && contractIds.has(invoice.contractId));
        const revenue = billboardInvoices.reduce((sum, invoice) => sum + numeric(invoice.subtotal), 0);
        const recordedContractCosts = billboardContracts.reduce((sum, contract) => sum + contractDirectCost(contract), 0);
        const supplementalPrintingCost = printing.supplementalByBillboard.get(billboardId) || 0;
        const linkedExpenseCost = billboardContracts.reduce(
            (sum, contract) => sum + (expenses.contractLinked.get(contract.id) || 0),
            0,
        );
        const attributedDirectCosts = recordedContractCosts + supplementalPrintingCost + linkedExpenseCost;
        return {
            billboardId,
            billboardName: billboard?.name || 'Unknown billboard',
            revenue,
            realizedRevenue: revenue,
            totalRevenue: revenue,
            cogs: attributedDirectCosts,
            directCosts: attributedDirectCosts,
            attributedDirectCosts,
            recordedContractCosts,
            supplementalPrintingCost,
            linkedExpenseCost,
            printingJobCosts: supplementalPrintingCost,
            supplementalDirectCosts: supplementalPrintingCost,
            grossProfit: revenue - attributedDirectCosts,
            grossMargin: margin(revenue, attributedDirectCosts),
            contractCount: billboardContracts.length,
            invoiceCount: billboardInvoices.length,
        };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
}

// ============================================
// PER-CLIENT PROFITABILITY
// ============================================

export interface ClientProfitability {
    clientId: string;
    clientName: string;
    revenue: number;
    realizedRevenue: number;
    totalRevenue: number;
    cogs: number;
    directCosts: number;
    attributedDirectCosts: number;
    recordedContractCosts: number;
    /** Campaign-share supplemental printing rolled up from the client's contracts. */
    supplementalPrintingCost: number;
    /** Operating expenses linked to the client's contracts (campaign costs). */
    contractLinkedExpenses: number;
    /** Operating expenses linked directly to the client (no campaign). */
    clientLinkedExpenses: number;
    grossProfit: number;
    grossMargin: number;
    contractCount: number;
    invoiceCount: number;
    /** Realised invoice revenue with no contractId, shown separately. */
    unlinkedInvoiceRevenue: number;
    unlinkedInvoiceCount: number;
}

export function getClientProfitability(): ClientProfitability[] {
    const clients = getClients();
    const contracts = getContracts();
    const invoices = realisedInvoices();
    const supplementalAllocation = allocateSupplementalPrinting(contracts);
    const expenses = buildExpenseAttribution(contracts);

    // Include an unknown client bucket when a valid invoice references a
    // client that is not present in the local client directory.  A Set keeps
    // duplicate references from producing duplicate rows.
    const clientIds = new Set(clients.map(client => client.id));
    for (const invoice of invoices) {
        if (invoice.clientId) clientIds.add(invoice.clientId);
    }

    const rows = [...clientIds].map(clientId => {
        const client = clients.find(item => item.id === clientId);
        const clientContracts = contracts.filter(contract => contract.clientId === clientId);
        const clientInvoices = invoices.filter(invoice => invoice.clientId === clientId);
        const revenue = clientInvoices.reduce((sum, invoice) => sum + numeric(invoice.subtotal), 0);
        const knownContractIds = new Set(contracts.map(contract => contract.id));
        const unlinked = clientInvoices.filter(invoice => !invoice.contractId || !knownContractIds.has(invoice.contractId));
        const recordedContractCosts = clientContracts.reduce((sum, contract) => sum + contractDirectCost(contract), 0);
        // Supplemental printing is allocated to the billboard's campaigns, so
        // client rows roll those campaign shares up unchanged.  This keeps
        // client, campaign, and billboard totals reconcilable.
        const supplementalPrintingCost = clientContracts.reduce(
            (sum, contract) => sum + (supplementalAllocation.get(contract.id) || 0),
            0,
        );
        const contractLinkedExpenses = clientContracts.reduce(
            (sum, contract) => sum + (expenses.contractLinked.get(contract.id) || 0),
            0,
        );
        const clientLinkedExpenses = expenses.clientLinked.get(clientId) || 0;
        const attributedDirectCosts = recordedContractCosts + supplementalPrintingCost + contractLinkedExpenses + clientLinkedExpenses;
        return {
            clientId,
            clientName: client?.companyName || 'Unknown client',
            revenue,
            realizedRevenue: revenue,
            totalRevenue: revenue,
            cogs: attributedDirectCosts,
            directCosts: attributedDirectCosts,
            attributedDirectCosts,
            recordedContractCosts,
            supplementalPrintingCost,
            contractLinkedExpenses,
            clientLinkedExpenses,
            grossProfit: revenue - attributedDirectCosts,
            grossMargin: margin(revenue, attributedDirectCosts),
            contractCount: clientContracts.length,
            invoiceCount: clientInvoices.length,
            unlinkedInvoiceRevenue: unlinked.reduce((sum, invoice) => sum + numeric(invoice.subtotal), 0),
            unlinkedInvoiceCount: unlinked.length,
        };
    }).sort((a, b) => b.grossProfit - a.grossProfit);

    // Invoices with no client cannot appear in a named client row; surface
    // them as an Unassigned catch-all so the tab sums to realised revenue.
    const unassignedInvoices = invoices.filter(invoice => !invoice.clientId);
    const unassignedRevenue = unassignedInvoices.reduce((sum, invoice) => sum + numeric(invoice.subtotal), 0);
    if (unassignedInvoices.length > 0) {
        rows.push({
            clientId: UNASSIGNED_CLIENT_ID,
            clientName: 'Unassigned (no client on invoice)',
            revenue: unassignedRevenue,
            realizedRevenue: unassignedRevenue,
            totalRevenue: unassignedRevenue,
            cogs: 0,
            directCosts: 0,
            attributedDirectCosts: 0,
            recordedContractCosts: 0,
            supplementalPrintingCost: 0,
            contractLinkedExpenses: 0,
            clientLinkedExpenses: 0,
            grossProfit: unassignedRevenue,
            grossMargin: margin(unassignedRevenue, 0),
            contractCount: 0,
            invoiceCount: unassignedInvoices.length,
            unlinkedInvoiceRevenue: unassignedRevenue,
            unlinkedInvoiceCount: unassignedInvoices.length,
        });
    }
    return rows;
}

// ============================================
// PER-CONTRACT / CAMPAIGN PROFITABILITY
// ============================================

export interface ContractProfitability {
    contractId: string;
    clientId: string;
    billboardId?: string;
    clientName: string;
    billboardName: string;
    monthlyRate: number;
    termMonths: number;
    recurringRevenue: number;
    oneTimeRevenue: number;
    totalRevenue: number;
    revenue: number;
    realizedRevenue: number;
    cogs: number;
    directCosts: number;
    attributedDirectCosts: number;
    recordedContractCosts: number;
    /** This campaign's share of supplemental printing on its billboard. */
    supplementalPrintingCost: number;
    /** Operating expenses linked directly to this contract. */
    linkedExpenseCost: number;
    grossProfit: number;
    grossMargin: number;
    invoiceCount: number;
}

export function getContractProfitability(): ContractProfitability[] {
    const contracts = getContracts();
    const clients = getClients();
    const billboards = getBillboards();
    const invoices = realisedInvoices();
    const supplementalAllocation = allocateSupplementalPrinting(contracts);
    const expenses = buildExpenseAttribution(contracts);

    const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown client';
    const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown billboard';

    return contracts.map(contract => {
        const contractInvoices = invoices.filter(invoice => invoice.contractId === contract.id);
        const termMonths = Math.max(
            1,
            Math.ceil((new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)),
        );
        const revenueSplit = contractInvoices.reduce((sum, invoice) => {
            const split = classifyInvoiceRevenue(invoice);
            return { recurring: sum.recurring + split.recurring, oneTime: sum.oneTime + split.oneTime };
        }, { recurring: 0, oneTime: 0 });
        const totalRevenue = revenueSplit.recurring + revenueSplit.oneTime;
        // Direct costs are the recorded contract cost plus this campaign's
        // share of supplemental printing on its billboard, so the campaign
        // row reconciles with the billboard total.  Monthly-rate revenue
        // remains realised only when present on an invoice.
        const recordedContractCosts = contractDirectCost(contract);
        const supplementalPrintingCost = supplementalAllocation.get(contract.id) || 0;
        const linkedExpenseCost = expenses.contractLinked.get(contract.id) || 0;
        const attributedDirectCosts = recordedContractCosts + supplementalPrintingCost + linkedExpenseCost;
        return {
            contractId: contract.id,
            clientId: contract.clientId,
            billboardId: contract.billboardId,
            clientName: getClientName(contract.clientId),
            billboardName: getBillboardName(contract.billboardId),
            monthlyRate: numeric(contract.monthlyRate),
            termMonths,
            recurringRevenue: revenueSplit.recurring,
            oneTimeRevenue: revenueSplit.oneTime,
            totalRevenue,
            revenue: totalRevenue,
            realizedRevenue: totalRevenue,
            cogs: attributedDirectCosts,
            directCosts: attributedDirectCosts,
            attributedDirectCosts,
            recordedContractCosts,
            supplementalPrintingCost,
            linkedExpenseCost,
            grossProfit: totalRevenue - attributedDirectCosts,
            grossMargin: margin(totalRevenue, attributedDirectCosts),
            invoiceCount: contractInvoices.length,
        };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
}

// ============================================
// MONTHLY TRENDS
// ============================================

export interface MonthlyProfitData {
    month: string;
    revenue: number;
    recurringRevenue: number;
    oneTimeRevenue: number;
    cogs: number;
    grossProfit: number;
    netProfit: number;
}

/** Calculate the last six calendar months from realised invoices and recorded costs. */
export function getMonthlyProfitTrends(): MonthlyProfitData[] {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const today = new Date();
    const results: MonthlyProfitData[] = [];

    for (let i = 5; i >= 0; i--) {
        const monthIndex = (today.getMonth() - i + 12) % 12;
        const year = today.getFullYear() - (today.getMonth() - i < 0 ? 1 : 0);
        const monthName = months[monthIndex];
        const monthInvoices = realisedInvoices().filter(invoice => {
            const date = new Date(invoice.date);
            return date.getMonth() === monthIndex && date.getFullYear() === year;
        });
        let recurringRevenue = 0;
        let oneTimeRevenue = 0;
        for (const invoice of monthInvoices) {
            const split = classifyInvoiceRevenue(invoice);
            recurringRevenue += split.recurring;
            oneTimeRevenue += split.oneTime;
        }

        const monthContracts = getContracts().filter(contract => {
            const start = new Date(contract.startDate);
            return start.getMonth() === monthIndex && start.getFullYear() === year;
        });
        const monthCOGS = monthContracts.reduce((sum, contract) => sum + contractDirectCost(contract), 0);
        const monthStart = new Date(Date.UTC(year, monthIndex, 1));
        const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
        const outsourcedMonthly = outsourcedBillboardsForAnalytics()
            .filter(board => new Date(board.contractStart) <= monthEnd && new Date(board.contractEnd) >= monthStart)
            .reduce((sum, board) => sum + numeric(board.monthlyPayout), 0);
        const operationalMonthly = getExpenses()
            .filter(expense => {
                const date = new Date(expense.date);
                return date.getMonth() === monthIndex && date.getFullYear() === year;
            })
            .reduce((sum, expense) => sum + numeric(expense.amount), 0);
        const revenue = recurringRevenue + oneTimeRevenue;
        const grossProfit = revenue - monthCOGS;
        results.push({
            month: monthName,
            revenue,
            recurringRevenue,
            oneTimeRevenue,
            cogs: monthCOGS,
            grossProfit,
            netProfit: grossProfit - operationalMonthly - outsourcedMonthly,
        });
    }
    return results;
}

// ============================================
// UTILITIES
// ============================================

export function formatCurrency(value: number): string {
    return `$${numeric(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number): string {
    return `${numeric(value).toFixed(1)}%`;
}
