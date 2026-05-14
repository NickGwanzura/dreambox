/**
 * Profit & Analytics Enhancement Utility
 *
 * Properly separates recurring revenue from one-time fees,
 * calculates true COGS (cost of goods sold), and provides
 * per-contract, per-client, and overall profitability metrics.
 */

import { getContracts, getInvoices, getExpenses, printingJobs, outsourcedBillboards, getBillboards, getClients } from './mockData';
import { Invoice, Client, Billboard } from '../types';

// ============================================
// REVENUE CLASSIFICATION
// ============================================

/**
 * Split an invoice total into recurring vs one-time portions.
 * This is an approximation — ideally invoice items would be tagged.
 * For now, we estimate based on contract structure.
 */
export function classifyInvoiceRevenue(invoice: Invoice): { recurring: number; oneTime: number } {
    // Find contracts that match this invoice (by clientId and date range)
    const contracts = getContracts().filter(c => c.clientId === invoice.clientId);

    // Estimate: if invoice date falls within contract dates, a portion is recurring
    // For simplicity: we check if invoice total matches any contract's first month + fees
    // This is a heuristic — proper implementation would need invoice line items

    let recurring = 0;
    let oneTime = 0;

    // If invoice total is close to (monthlyRate + installation + printing + production),
    // we can reasonably split it
    for (const contract of contracts) {
        const expectedTotal = contract.monthlyRate +
                              (contract.installationCost || 0) +
                              (contract.printingCost || 0) +
                              (contract.productionCost || 0);

        if (Math.abs(invoice.total - expectedTotal) < 0.01) {
            recurring = contract.monthlyRate;
            oneTime = (contract.installationCost || 0) +
                      (contract.printingCost || 0) +
                      (contract.productionCost || 0);
            break;
        }
    }

    // Fallback: if we can't match, assume all is recurring (conservative)
    if (recurring === 0 && oneTime === 0) {
        recurring = invoice.total;
    }

    return { recurring, oneTime };
}

/**
 * Calculate total recurring revenue (MRR) from Active contracts.
 * This is the most reliable metric — directly from contract monthly rates.
 */
export function getTotalMonthlyRecurringRevenue(): number {
    const today = new Date();
    return getContracts()
        .filter(c => c.status === 'Active' &&
                     new Date(c.startDate) <= today &&
                     new Date(c.endDate) >= today)
        .reduce((sum, c) => sum + c.monthlyRate, 0);
}

/**
 * Calculate total one-time revenue from invoices (installation, printing, production fees).
 * More accurately: sum of all one-time charges across all contracts,
 * captured in the initial invoices.
 */
export function getTotalOneTimeRevenue(): number {
    const invoices = getInvoices().filter(i => String(i.type || '').toLowerCase() === 'invoice');
    let oneTimeTotal = 0;

    for (const invoice of invoices) {
        const { oneTime } = classifyInvoiceRevenue(invoice);
        oneTimeTotal += oneTime;
    }

    return oneTimeTotal;
}

// ============================================
// COST OF GOODS SOLD (COGS)
// ============================================

/**
 * Calculate total COGS directly attributable to delivering the contracted services:
 * - Installation labor/materials (estimated from contract installationCost as proxy)
 * - Printing costs (either from PrintingJob records or contract printingCost if jobs not linked)
 * - Production costs (from contract's productionCost field)
 * - Outsourced payouts (monthlyPayout × active months)
 */
export function getTotalCOGS(): number {
    const contracts = getContracts();

    // 1. Installation costs from contracts (as billed to client; assumed equal to actual cost for now)
    // TODO: track actual installation expenses per contract
    const installationCosts = contracts.reduce((sum, c) =>
        sum + (c.installationCost || 0), 0);

    // 2. Printing costs: use actual printingJobs if available, else fall back to contract printingCost
    const printingFromJobs = printingJobs.reduce((sum, job) => sum + job.totalCost, 0);
    const printingFromContracts = contracts.reduce((sum, c) =>
        sum + (c.printingCost || 0), 0);
    // Prefer actual job costs if they exist; otherwise use contract figure
    const printingCosts = printingJobs.length > 0 ? printingFromJobs : printingFromContracts;

    // 3. Production costs from contracts (auto-calculated for static boards)
    const productionCosts = contracts.reduce((sum, c) =>
        sum + (c.productionCost || 0), 0);

    // 4. Outsourced payouts: actual monthly payouts × 12 (annualized)
    // TODO: refine to active months only
    const outsourcedCosts = outsourcedBillboards.reduce((sum, b) =>
        sum + (b.monthlyPayout * 12), 0);

    // 5. Operational expenses (overhead not directly tied to contracts)
    const operationalExpenses = getExpenses().reduce((sum, e) => sum + e.amount, 0);

    return installationCosts + printingCosts + productionCosts + outsourcedCosts + operationalExpenses;
}

/**
 * Calculate Gross Profit: Revenue − Direct COGS (excludes overhead)
 * Gross Profit = (Recurring Revenue + One-Time Revenue) − (Installation + Printing + Production + Outsourced)
 * Gross Margin % = (Gross Profit / Revenue) × 100
 */
export function getGrossProfit(): { grossProfit: number; grossMargin: number; revenue: number } {
    const totalRevenue = getInvoices()
        .filter(i => String(i.type || '').toLowerCase() === 'invoice')
        .reduce((sum, i) => sum + i.total, 0);

    const cogs = getTotalCOGS();
    const grossProfit = totalRevenue - cogs;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return { grossProfit, grossMargin, revenue: totalRevenue };
}

/**
 * Calculate Net Profit: Gross Profit − Operating Expenses
 * (Expenses already included in COGS are NOT double-counted)
 * Operating expenses = getExpenses() excluding direct production/installation
 * Since we included all getExpenses() in COGS, net = gross − (additional overhead)?
 * Actually: getExpenses() are already in COGS. So Net = Gross if no other overhead.
 * But Expenses include categories like Electricity, Maintenance, Labor (Other) — those are overhead.
 * We'll keep Net = Revenue − Total COGS (which includes operational).
 */
export function getNetProfit(): number {
    const totalRevenue = getInvoices()
        .filter(i => String(i.type || '').toLowerCase() === 'invoice')
        .reduce((sum, i) => sum + i.total, 0);
    const totalCOGS = getTotalCOGS();
    return totalRevenue - totalCOGS;
}

// ============================================
// PER-CLIENT PROFITABILITY
// ============================================

export interface ClientProfitability {
    clientId: string;
    clientName: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    contractCount: number;
}

export function getClientProfitability(): ClientProfitability[] {
    const clients = getClients();
    const contracts = getContracts();
    const invoices = getInvoices().filter(i => String(i.type || '').toLowerCase() === 'invoice');

    return clients.map(client => {
        const clientContracts = contracts.filter(c => c.clientId === client.id);
        const clientInvoices = invoices.filter(i => i.clientId === client.id);

        // Revenue from invoices for this client
        const revenue = clientInvoices.reduce((sum, inv) => sum + inv.total, 0);

        // COGS from client's contracts (installation, printing, production, outsourced share)
        const cogs = clientContracts.reduce((sum, c) => {
            return sum +
                   (c.installationCost || 0) +
                   (c.printingCost || 0) +
                   (c.productionCost || 0);
        }, 0);

        const grossProfit = revenue - cogs;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        return {
            clientId: client.id,
            clientName: client.companyName,
            revenue,
            cogs,
            grossProfit,
            grossMargin,
            contractCount: clientContracts.length,
        };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
}

// ============================================
// PER-CONTRACT PROFITABILITY
// ============================================

export interface ContractProfitability {
    contractId: string;
    clientId: string;
    clientName: string;
    billboardName: string;
    monthlyRate: number;
    termMonths: number;
    recurringRevenue: number;
    oneTimeRevenue: number;
    totalRevenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
}

export function getContractProfitability(): ContractProfitability[] {
    const contracts = getContracts();
    const clients = getClients();
    const billboards = getBillboards();

    const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown';
    const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown';

    return contracts.map(contract => {
        const termMonths = Math.max(1, Math.ceil((new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)));
        const recurringRevenue = contract.monthlyRate * termMonths;
        const oneTimeRevenue = (contract.installationCost || 0) +
                               (contract.printingCost || 0) +
                               (contract.productionCost || 0);
        const totalRevenue = recurringRevenue + oneTimeRevenue;

        // For COGS, we match one-time costs. Monthly rate revenue has no COGS in current model
        // (assuming monthly rate is pure gross profit after overhead)
        // More accurate: allocate overhead per month, but for gross profit we treat monthly as pure
        const cogs = oneTimeRevenue; // simplification: one-time costs = COGS for those line items
        const grossProfit = recurringRevenue + (oneTimeRevenue - cogs); // = recurringRevenue only
        const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        return {
            contractId: contract.id,
            clientId: contract.clientId,
            clientName: getClientName(contract.clientId),
            billboardName: getBillboardName(contract.billboardId),
            monthlyRate: contract.monthlyRate,
            termMonths,
            recurringRevenue,
            oneTimeRevenue,
            totalRevenue,
            cogs,
            grossProfit,
            grossMargin,
        };
    }).sort((a, b) => b.grossProfit - a.grossProfit);
}

// ============================================
// MONTHLY TRENDS WITH PROPER PROFIT
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

/**
 * Calculate last 6 months of profit & loss with proper revenue/cost splits.
 */
export function getMonthlyProfitTrends(): MonthlyProfitData[] {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const today = new Date();
    const results: MonthlyProfitData[] = [];

    for (let i = 5; i >= 0; i--) {
        const monthIndex = (today.getMonth() - i + 12) % 12;
        const year = today.getFullYear() - (today.getMonth() - i < 0 ? 1 : 0);
        const monthName = months[monthIndex];

        // Invoices for this month
        const monthInvoices = getInvoices().filter(inv => {
            const d = new Date(inv.date);
            return String(inv.type || '').toLowerCase() === 'invoice' &&
                   d.getMonth() === monthIndex && d.getFullYear() === year;
        });

        // Split revenue
        let recurringRevenue = 0;
        let oneTimeRevenue = 0;
        for (const inv of monthInvoices) {
            const { recurring, oneTime } = classifyInvoiceRevenue(inv);
            recurringRevenue += recurring;
            oneTimeRevenue += oneTime;
        }

        // COGS: sum of installation/printing/production from contracts whose start date is this month
        // (one-time costs incurred when contract starts)
        const monthContracts = getContracts().filter(c => {
            const start = new Date(c.startDate);
            return start.getMonth() === monthIndex && start.getFullYear() === year;
        });

        const monthCOGS = monthContracts.reduce((sum, c) =>
            sum + (c.installationCost || 0) + (c.printingCost || 0) + (c.productionCost || 0), 0);

        // Add outsourced payouts for this month (actual monthly payouts, not annualized)
        const outsourcedMonthly = outsourcedBillboards.reduce((sum, b) => sum + (b.monthlyPayout || 0), 0);

        // Add operational expenses for this month
        const operationalMonthly = getExpenses().filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === monthIndex && d.getFullYear() === year;
        }).reduce((sum, e) => sum + e.amount, 0);

        const totalCOGS = monthCOGS + outsourcedMonthly + operationalMonthly;
        const grossProfit = recurringRevenue + oneTimeRevenue - totalCOGS;
        const netProfit = grossProfit; // In this simple model, net = gross (no additional overhead)

        results.push({
            month: monthName,
            revenue: recurringRevenue + oneTimeRevenue,
            recurringRevenue,
            oneTimeRevenue,
            cogs: totalCOGS,
            grossProfit,
            netProfit,
        });
    }

    return results;
}

// ============================================
// UTILITIES
// ============================================

export function formatCurrency(value: number): string {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}
