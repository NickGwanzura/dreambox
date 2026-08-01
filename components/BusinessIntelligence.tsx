import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  AlertTriangle, TrendingUp, Users, Monitor, DollarSign, FileText,
  Clock, CheckCircle2, XCircle, ArrowUpRight, Zap, Shield, Target, BarChart2,
  Lightbulb, PhoneCall, RefreshCw, TrendingDown, Star, Package
} from 'lucide-react';
import {
  getContracts, getInvoices, getClients, getBillboards, getExpenses,
} from '../services/mockData';
import { BillboardType } from '../types';
import { formatCurrency } from '../services/profitAnalytics';
import { generateBIAnalysis } from '../services/aiService';

type BITab = 'overview' | 'forecast' | 'assets' | 'clients' | 'funnel' | 'recommendations';

type RecPriority = 'critical' | 'high' | 'medium' | 'growth';

interface Recommendation {
  id: string;
  priority: RecPriority;
  category: string;
  title: string;
  detail: string;
  impact: string;
  action: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function monthLabel(offset: number): string {
  const d = addMonths(new Date(), offset);
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
}

function isActiveOn(startDate: string, endDate: string, month: Date): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  return start <= monthEnd && end >= monthStart;
}

// ─── main component ───────────────────────────────────────────────────────────

export const BusinessIntelligence: React.FC = () => {
  const [tab, setTab] = useState<BITab>('overview');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const aiAnalysisFetched = useRef(false);

  const contracts = useMemo(() => getContracts(), []);
  const invoices = useMemo(() => getInvoices(), []);
  const clients = useMemo(() => getClients(), []);
  const billboards = useMemo(() => getBillboards(), []);
  const expenses = useMemo(() => getExpenses(), []);

  const today = useMemo(() => new Date(), []);
  const activeContracts = useMemo(() =>
    contracts.filter(c => c.status === 'Active' && new Date(c.endDate) >= today),
    [contracts, today]);

  // ── Overview signals ──────────────────────────────────────────────────────

  const expiring30 = activeContracts.filter(c => daysUntil(c.endDate) <= 30);
  const expiring60 = activeContracts.filter(c => daysUntil(c.endDate) <= 60 && daysUntil(c.endDate) > 30);
  const overdueInvoices = invoices.filter(i => i.status === 'Overdue' && i.type === 'Invoice');
  const coldQuotes = invoices.filter(i => i.type === 'Quotation' && i.quoteStatus !== 'Converted' && i.quoteStatus !== 'Rejected' && daysUntil(i.date) < -14);

  const totalMRR = activeContracts.reduce((s, c) => s + c.monthlyRate, 0);
  const paidInvoiceTotal = invoices.filter(i => i.type === 'Receipt').reduce((s, i) => s + Number(i.total || 0), 0);
  const billedInvoiceTotal = invoices.filter(i => i.type === 'Invoice').reduce((s, i) => s + Number(i.total || 0), 0);
  const pendingInvoiceTotal = Math.max(0, billedInvoiceTotal - paidInvoiceTotal);

  // ── Expense metrics ───────────────────────────────────────────────────────

  const thisMonth = today.toISOString().slice(0, 7); // 'YYYY-MM'
  const monthlyExpenses = useMemo(
    () => expenses.filter(e => e.date.startsWith(thisMonth)),
    [expenses, thisMonth]
  );
  const totalMonthlyExpenses = monthlyExpenses.reduce((s, e) => s + e.amount, 0);
  const totalAllExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const e of expenses) {
      cats[e.category] = (cats[e.category] || 0) + e.amount;
    }
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const estNetProfit = totalMRR - totalMonthlyExpenses;
  const expenseRatio = totalMRR > 0 ? Math.round((totalMonthlyExpenses / totalMRR) * 100) : 0;
  const topExpenseCategory = expenseByCategory[0]?.[0] ?? null;
  const topExpensePct = totalAllExpenses > 0 && expenseByCategory[0]
    ? Math.round((expenseByCategory[0][1] / totalAllExpenses) * 100)
    : 0;

  const totalStaticSides = billboards.filter(b => b.type === BillboardType.Static).length * 2;
  const rentedStaticSides = activeContracts.filter(c => c.side === 'A' || c.side === 'B' || c.side === 'Both')
    .reduce((s, c) => s + (c.side === 'Both' ? 2 : 1), 0);
  const totalLedSlots = billboards.filter(b => b.type === BillboardType.LED).reduce((s, b) => s + (b.totalSlots || 0), 0);
  const rentedLedSlots = billboards.filter(b => b.type === BillboardType.LED).reduce((s, b) => s + (b.rentedSlots || 0), 0);
  const occupancyPct = (totalStaticSides + totalLedSlots) > 0
    ? Math.round(((rentedStaticSides + rentedLedSlots) / (totalStaticSides + totalLedSlots)) * 100)
    : 0;

  // ── Revenue Forecast (3 months) ───────────────────────────────────────────

  const pipelineValue = invoices
    .filter(i => (i.type === 'Quotation' || i.type === 'Proforma') && i.quoteStatus !== 'Converted' && i.quoteStatus !== 'Rejected')
    .reduce((s, i) => s + i.total, 0);

  const forecastData = [0, 1, 2, 3].map(offset => {
    const monthDate = addMonths(today, offset);
    const guaranteed = contracts
      .filter(c => c.status === 'Active' && isActiveOn(c.startDate, c.endDate, monthDate))
      .reduce((s, c) => s + c.monthlyRate, 0);
    const atRisk = contracts
      .filter(c => c.status === 'Active' && isActiveOn(c.startDate, c.endDate, monthDate) && daysUntil(c.endDate) <= 30 + offset * 30)
      .reduce((s, c) => s + c.monthlyRate, 0);
    const pipeline = Math.round(pipelineValue * 0.3 / 3);
    return {
      month: monthLabel(offset),
      guaranteed: Math.round(guaranteed),
      atRisk: Math.round(atRisk),
      pipeline,
      total: Math.round(guaranteed + pipeline),
    };
  });

  // ── Asset performance ─────────────────────────────────────────────────────

  const assetData = useMemo(() => {
    return billboards.map(b => {
      const boardContracts = activeContracts.filter(c => c.billboardId === b.id);
      const monthlyRevenue = boardContracts.reduce((s, c) => s + c.monthlyRate, 0);
      let occupancy = 0;
      if (b.type === BillboardType.LED) {
        const slots = b.totalSlots || 0;
        const rented = b.rentedSlots || 0;
        occupancy = slots > 0 ? Math.round((rented / slots) * 100) : 0;
      } else {
        const sides = boardContracts.reduce((s, c) => s + (c.side === 'Both' ? 2 : 1), 0);
        occupancy = Math.round((Math.min(sides, 2) / 2) * 100);
      }
      return { id: b.id, name: b.name, town: b.town || '—', type: b.type, monthlyRevenue, occupancy, contracts: boardContracts.length };
    }).sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  }, [billboards, activeContracts]);

  const vacantBoards = assetData.filter(a => a.occupancy === 0);
  const topBoards = assetData.filter(a => a.monthlyRevenue > 0).slice(0, 8);

  // ── Client intelligence ───────────────────────────────────────────────────

  const clientData = useMemo(() => {
    return clients.map(cl => {
      const clInvoices = invoices.filter(i => i.clientId === cl.id && i.type === 'Invoice');
      const clReceipts = invoices.filter(i => i.clientId === cl.id && i.type === 'Receipt');
      const clv = clReceipts.reduce((s, i) => s + Number(i.total || 0), 0);
      const pending = Math.max(0, clInvoices.reduce((s, i) => s + Number(i.total || 0), 0) - clv);
      const clContracts = activeContracts.filter(c => c.clientId === cl.id);
      const nextExpiry = clContracts.length
        ? Math.min(...clContracts.map(c => daysUntil(c.endDate)))
        : null;
      const hasActiveQuote = invoices.some(i => i.clientId === cl.id && (i.type === 'Quotation' || i.type === 'Proforma') && i.quoteStatus !== 'Converted' && i.quoteStatus !== 'Rejected');
      const atRisk = nextExpiry !== null && nextExpiry <= 60 && !hasActiveQuote;
      return { id: cl.id, name: cl.companyName, clv, pending, contracts: clContracts.length, nextExpiry, atRisk };
    }).sort((a, b) => b.clv - a.clv);
  }, [clients, invoices, activeContracts]);

  const atRiskClients = clientData.filter(c => c.atRisk);
  const topClients = clientData.filter(c => c.clv > 0).slice(0, 8);

  // ── Sales funnel ──────────────────────────────────────────────────────────

  const quotationCount = invoices.filter(i => i.type === 'Quotation').length;
  const proformaCount = invoices.filter(i => i.type === 'Proforma').length;
  const invoiceCount = invoices.filter(i => i.type === 'Invoice').length;
  const paidCount = invoices.filter(i => i.type === 'Invoice' && i.status === 'Paid').length;
  const receiptCount = invoices.filter(i => i.type === 'Receipt').length;

  const funnelData = [
    { name: 'Quotations', value: quotationCount + proformaCount, fill: '#6366f1' },
    { name: 'Invoiced', value: invoiceCount, fill: '#818cf8' },
    { name: 'Paid', value: paidCount + receiptCount, fill: '#10b981' },
  ];

  const conversionRate = (quotationCount + proformaCount) > 0
    ? Math.round(((paidCount + receiptCount) / (quotationCount + proformaCount)) * 100)
    : 0;

  const avgDealSize = invoiceCount > 0
    ? Math.round(invoices.filter(i => i.type === 'Invoice').reduce((s, i) => s + i.total, 0) / invoiceCount)
    : 0;

  // ── Recommendations engine ────────────────────────────────────────────────

  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];

    // 1. Overdue invoices — critical collection risk
    if (overdueInvoices.length > 0) {
      const total = overdueInvoices.reduce((s, i) => s + i.total, 0);
      const clientNames = [...new Set(overdueInvoices.map(i => {
        const cl = clients.find(c => c.id === i.clientId);
        return cl?.companyName || 'Unknown';
      }))].slice(0, 3).join(', ');
      recs.push({
        id: 'overdue',
        priority: 'critical',
        category: 'Collections',
        title: `Collect ${formatCurrency(total)} in overdue invoices`,
        detail: `${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? 's' : ''} are overdue from: ${clientNames}${overdueInvoices.length > 3 ? ' and others' : ''}.`,
        impact: formatCurrency(total) + ' at risk',
        action: 'Send payment reminders and escalate to phone calls for the largest balances.',
      });
    }

    // 2. Expiring contracts with no renewal quote in pipeline — high churn risk
    const expiringNoQuote = expiring30.filter(c => {
      return !invoices.some(i => i.clientId === c.clientId && (i.type === 'Quotation' || i.type === 'Proforma') && i.quoteStatus !== 'Converted' && i.quoteStatus !== 'Rejected');
    });
    if (expiringNoQuote.length > 0) {
      const atRiskMRR = expiringNoQuote.reduce((s, c) => s + c.monthlyRate, 0);
      recs.push({
        id: 'renew-30',
        priority: 'critical',
        category: 'Renewals',
        title: `Renew ${expiringNoQuote.length} contract${expiringNoQuote.length > 1 ? 's' : ''} expiring in 30 days`,
        detail: `${formatCurrency(atRiskMRR)}/mo of guaranteed revenue expires with no renewal quote issued yet.`,
        impact: formatCurrency(atRiskMRR) + '/mo at risk',
        action: 'Issue renewal quotations immediately — these accounts have no active quote in pipeline.',
      });
    }

    // 3. At-risk clients (60 day window, no quote)
    if (atRiskClients.length > 0) {
      const names = atRiskClients.slice(0, 3).map(c => c.name).join(', ');
      recs.push({
        id: 'at-risk-clients',
        priority: 'high',
        category: 'Client Retention',
        title: `${atRiskClients.length} account${atRiskClients.length > 1 ? 's' : ''} at risk of churning`,
        detail: `${names}${atRiskClients.length > 3 ? ' and others' : ''} have contracts expiring within 60 days and no active quote.`,
        impact: 'Potential revenue loss',
        action: 'Schedule calls and send proforma invoices to lock in renewals before competitors approach.',
      });
    }

    // 4. Cold quotes — high pipeline leak
    if (coldQuotes.length > 0) {
      const coldValue = coldQuotes.reduce((s, q) => s + q.total, 0);
      const oldest = coldQuotes.reduce((prev, cur) => new Date(cur.date) < new Date(prev.date) ? cur : prev);
      const oldestClient = clients.find(c => c.id === oldest.clientId)?.companyName || 'Unknown';
      recs.push({
        id: 'cold-quotes',
        priority: 'high',
        category: 'Pipeline',
        title: `Follow up on ${coldQuotes.length} cold quote${coldQuotes.length > 1 ? 's' : ''}`,
        detail: `${formatCurrency(coldValue)} in pipeline has had no activity for 14+ days. Oldest is ${oldestClient}'s quote.`,
        impact: formatCurrency(coldValue) + ' pipeline',
        action: 'Call each prospect directly. For expired quotes, reissue with updated pricing and a limited-time offer.',
      });
    }

    // 5. Vacant boards — opportunity cost
    if (vacantBoards.length > 0) {
      const potentialMRR = vacantBoards.reduce((s, b) => {
        const avgRate = totalMRR / Math.max(assetData.filter(a => a.occupancy > 0).length, 1);
        return s + avgRate;
      }, 0);
      recs.push({
        id: 'vacant',
        priority: 'high',
        category: 'Asset Utilisation',
        title: `${vacantBoards.length} board${vacantBoards.length > 1 ? 's' : ''} generating zero revenue`,
        detail: `${vacantBoards.map(b => b.name).slice(0, 3).join(', ')}${vacantBoards.length > 3 ? ` +${vacantBoards.length - 3} more` : ''} are completely unoccupied.`,
        impact: `~${formatCurrency(Math.round(potentialMRR))}/mo opportunity`,
        action: 'Run a targeted campaign for these locations — offer discounted first-month rates to new advertisers to get them occupied.',
      });
    }

    // 6. Revenue concentration risk
    if (clientData.length > 0 && totalMRR > 0) {
      const topClient = clientData[0];
      const topClientMRR = activeContracts.filter(c => c.clientId === topClient.id).reduce((s, c) => s + c.monthlyRate, 0);
      const concentration = Math.round((topClientMRR / totalMRR) * 100);
      if (concentration >= 35) {
        recs.push({
          id: 'concentration',
          priority: 'medium',
          category: 'Risk Management',
          title: `Revenue concentrated: ${topClient.name} = ${concentration}% of MRR`,
          detail: `A single client accounts for ${concentration}% of your monthly recurring revenue. Loss of this account would be severe.`,
          impact: formatCurrency(topClientMRR) + '/mo exposure',
          action: 'Actively prospect new clients and diversify your portfolio to reduce dependency on any single account.',
        });
      }
    }

    // 7. Low conversion rate
    if ((quotationCount + proformaCount) >= 5 && conversionRate < 35) {
      recs.push({
        id: 'conversion',
        priority: 'medium',
        category: 'Sales Efficiency',
        title: `Quote-to-payment conversion is low at ${conversionRate}%`,
        detail: `Only ${conversionRate}% of quotes convert to paid revenue. Industry benchmark is 40–60%.`,
        impact: 'Sales efficiency gap',
        action: 'Review quote pricing and presentation. Add an expiry date to create urgency. Follow up every cold quote within 48 hours.',
      });
    }

    // 8. Upsell top clients with available sides
    const topClientUpsell = clientData.slice(0, 3).filter(c => {
      const clientContracts = activeContracts.filter(ac => ac.clientId === c.id);
      const usedBoardIds = new Set(clientContracts.map(ac => ac.billboardId));
      return usedBoardIds.size < billboards.length && c.clv > 0;
    });
    if (topClientUpsell.length > 0) {
      const names = topClientUpsell.map(c => c.name).join(', ');
      recs.push({
        id: 'upsell',
        priority: 'growth',
        category: 'Growth',
        title: `Upsell opportunity with top ${topClientUpsell.length} client${topClientUpsell.length > 1 ? 's' : ''}`,
        detail: `${names} are high-value accounts with available board sides they don't yet occupy.`,
        impact: 'Revenue expansion',
        action: 'Pitch additional billboard placements to existing high-value clients — upselling costs 5× less than new client acquisition.',
      });
    }

    // 9. LED boards if occupancy is low
    const ledBoards = billboards.filter(b => b.type === BillboardType.LED);
    const ledOccupancy = ledBoards.length > 0
      ? Math.round(((ledBoards.reduce((s, b) => s + (b.rentedSlots || 0), 0)) / (ledBoards.reduce((s, b) => s + (b.totalSlots || 0), 0) || 1)) * 100)
      : null;
    if (ledOccupancy !== null && ledOccupancy < 60 && ledBoards.length > 0) {
      recs.push({
        id: 'led-slots',
        priority: 'growth',
        category: 'Digital Inventory',
        title: `LED boards at ${ledOccupancy}% capacity — sell more slots`,
        detail: `Digital LED inventory is underutilised. Multiple timeslots are available across ${ledBoards.length} board${ledBoards.length > 1 ? 's' : ''}.`,
        impact: `${ledBoards.reduce((s, b) => s + ((b.totalSlots || 0) - (b.rentedSlots || 0)), 0)} slots available`,
        action: "Package unsold LED slots as short-term or trial campaigns to attract SME advertisers who cannot commit to static placements.",
      });
    }

    // 10. High expense-to-revenue ratio
    if (totalMRR > 0 && totalMonthlyExpenses > 0 && expenseRatio >= 60) {
      recs.push({
        id: 'high-costs',
        priority: expenseRatio >= 80 ? 'critical' : 'high',
        category: 'Cost Control',
        title: `Operating costs are ${expenseRatio}% of monthly revenue`,
        detail: `Monthly expenses (${formatCurrency(totalMonthlyExpenses)}) are consuming ${expenseRatio}% of your MRR (${formatCurrency(totalMRR)}), leaving only ${formatCurrency(Math.max(0, estNetProfit))} net.`,
        impact: `Est. net profit: ${formatCurrency(estNetProfit)}`,
        action: expenseRatio >= 80
          ? 'Conduct an urgent cost audit. Identify and eliminate non-essential spend before it exceeds revenue.'
          : 'Review top spending categories and negotiate supplier rates. A 10% cost reduction could meaningfully improve margins.',
      });
    }

    // 11. Single expense category dominates (>50%)
    if (topExpenseCategory && topExpensePct >= 50 && totalAllExpenses > 0) {
      recs.push({
        id: 'expense-concentration',
        priority: 'medium',
        category: 'Cost Control',
        title: `${topExpenseCategory} is ${topExpensePct}% of all recorded costs`,
        detail: `Over half your operating expenses come from a single category. This concentration creates risk if ${topExpenseCategory.toLowerCase()} costs spike.`,
        impact: `${formatCurrency(expenseByCategory[0][1])} in ${topExpenseCategory}`,
        action: `Get competitive quotes for ${topExpenseCategory.toLowerCase()} services. Bulk contracts or supplier consolidation can reduce this category significantly.`,
      });
    }

    // 12. No expenses tracked yet
    if (expenses.length === 0) {
      recs.push({
        id: 'track-expenses',
        priority: 'medium',
        category: 'Financial Visibility',
        title: 'No expenses recorded — profit picture is incomplete',
        detail: 'Without expense data, net profit calculations and cost-to-revenue analysis are unavailable. This limits financial decision-making.',
        impact: 'Blind spot in P&L reporting',
        action: 'Start logging expenses using the Add Expense quick-action on the dashboard. Even rough figures enable meaningful margin analysis.',
      });
    }

    // Sort: critical → high → medium → growth
    const order: RecPriority[] = ['critical', 'high', 'medium', 'growth'];
    return recs.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  }, [overdueInvoices, expiring30, atRiskClients, coldQuotes, vacantBoards, clientData, totalMRR, activeContracts, quotationCount, proformaCount, conversionRate, assetData, billboards, clients, invoices, expenses, totalMonthlyExpenses, expenseRatio, estNetProfit, topExpenseCategory, topExpensePct, expenseByCategory]);

  // ─── DeepSeek AI analysis (fires once when Recommendations tab is opened) ──

  useEffect(() => {
    if (tab !== 'recommendations' || aiAnalysisFetched.current) return;
    aiAnalysisFetched.current = true;
    setAiAnalysisLoading(true);
    generateBIAnalysis({
      totalMRR,
      occupancyPct,
      expiring30Count: expiring30.length,
      atRiskClientCount: atRiskClients.length,
      overdueInvoiceCount: overdueInvoices.length,
      overdueAmount: overdueInvoices.reduce((s, i) => s + i.total, 0),
      vacantBoardCount: vacantBoards.length,
      totalBoards: billboards.length,
      conversionRate,
      pipelineValue,
      topRecommendations: recommendations.slice(0, 5).map(r => ({ priority: r.priority, title: r.title })),
      estNetProfit,
      expenseRatio,
    }).then(text => {
      setAiAnalysis(text || null);
    }).finally(() => setAiAnalysisLoading(false));
  }, [tab]);

  // ─────────────────────────────────────────────────────────────────────────

  const tabs: { id: BITab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'assets', label: 'Assets' },
    { id: 'clients', label: 'Clients' },
    { id: 'funnel', label: 'Sales Funnel' },
    { id: 'recommendations', label: 'Recommendations' },
  ];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Business Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">Forward-looking signals, forecasts, and asset intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-xl px-3 py-1.5">
          <Clock size={12} />
          <span>Updated now</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              tab === t.id
                ? 'bg-slate-900 text-white shadow'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Signal KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Monthly Recurring', value: formatCurrency(totalMRR), sub: `${activeContracts.length} active contracts`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Portfolio Occupancy', value: `${occupancyPct}%`, sub: `${rentedStaticSides + rentedLedSlots} of ${totalStaticSides + totalLedSlots} units`, icon: Monitor, color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Pending Collections', value: formatCurrency(pendingInvoiceTotal), sub: `${overdueInvoices.length} overdue`, icon: Clock, color: overdueInvoices.length > 0 ? 'text-amber-600' : 'text-slate-600', bg: overdueInvoices.length > 0 ? 'bg-amber-50' : 'bg-slate-50' },
              { label: 'Total Collected', value: formatCurrency(paidInvoiceTotal), sub: 'all time (paid invoices)', icon: CheckCircle2, color: 'text-slate-700', bg: 'bg-slate-100' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <div className={`w-8 h-8 rounded-xl ${kpi.bg} flex items-center justify-center mb-3`}>
                  <kpi.icon size={16} className={kpi.color} />
                </div>
                <div className="text-xl font-black text-slate-900">{kpi.value}</div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{kpi.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Expense + Profit KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: 'Expenses This Month',
                value: formatCurrency(totalMonthlyExpenses),
                sub: `${monthlyExpenses.length} recorded`,
                icon: TrendingDown,
                color: totalMonthlyExpenses > 0 ? 'text-rose-600' : 'text-slate-500',
                bg: totalMonthlyExpenses > 0 ? 'bg-rose-50' : 'bg-slate-50',
              },
              {
                label: 'Est. Net Profit',
                value: formatCurrency(estNetProfit),
                sub: `MRR minus monthly costs`,
                icon: DollarSign,
                color: estNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
                bg: estNetProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50',
              },
              {
                label: 'Expense-to-Revenue',
                value: `${expenseRatio}%`,
                sub: expenseRatio < 40 ? 'Healthy margin' : expenseRatio < 70 ? 'Watch costs' : 'High cost ratio',
                icon: BarChart2,
                color: expenseRatio < 40 ? 'text-emerald-600' : expenseRatio < 70 ? 'text-amber-600' : 'text-red-600',
                bg: expenseRatio < 40 ? 'bg-emerald-50' : expenseRatio < 70 ? 'bg-amber-50' : 'bg-red-50',
              },
              {
                label: 'Top Expense Category',
                value: topExpenseCategory || 'None',
                sub: topExpenseCategory ? `${topExpensePct}% of all costs` : 'No expenses recorded',
                icon: Package,
                color: 'text-slate-600',
                bg: 'bg-slate-100',
              },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <div className={`w-8 h-8 rounded-xl ${kpi.bg} flex items-center justify-center mb-3`}>
                  <kpi.icon size={16} className={kpi.color} />
                </div>
                <div className="text-xl font-black text-slate-900">{kpi.value}</div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{kpi.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Expense category breakdown */}
          {expenseByCategory.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown size={14} className="text-rose-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Expense Breakdown by Category</h3>
                <span className="ml-auto text-[11px] text-slate-400">All time · {formatCurrency(totalAllExpenses)} total</span>
              </div>
              <div className="space-y-2.5">
                {expenseByCategory.map(([cat, amt]) => {
                  const pct = totalAllExpenses > 0 ? Math.round((amt / totalAllExpenses) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{cat}</span>
                        <span className="text-slate-500">{formatCurrency(amt)} <span className="text-slate-400">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Expiring contracts */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Contracts Expiring Soon</span>
                {(expiring30.length + expiring60.length) > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {expiring30.length + expiring60.length} total
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                {[...expiring30, ...expiring60].length === 0 ? (
                  <div className="flex items-center gap-2 px-4 py-4 text-xs text-slate-400">
                    <CheckCircle2 size={14} className="text-emerald-400" /> No contracts expiring in the next 60 days
                  </div>
                ) : (
                  [...expiring30.map(c => ({ ...c, urgency: 'high' })), ...expiring60.map(c => ({ ...c, urgency: 'medium' }))].map(c => {
                    const client = clients.find(cl => cl.id === c.clientId);
                    const board = billboards.find(b => b.id === c.billboardId);
                    const days = daysUntil(c.endDate);
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <div className={`w-1.5 h-8 rounded-full ${c.urgency === 'high' ? 'bg-red-400' : 'bg-amber-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{client?.companyName || 'Unknown Client'}</p>
                          <p className="text-[11px] text-slate-500 truncate">{board?.name || c.billboardId}</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.urgency === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                          {days}d
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Action items */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <Zap size={14} className="text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Action Items</span>
              </div>
              <div className="divide-y divide-slate-50">
                {[
                  {
                    label: 'Overdue invoices',
                    count: overdueInvoices.length,
                    desc: overdueInvoices.length > 0
                      ? `${formatCurrency(overdueInvoices.reduce((s, i) => s + i.total, 0))} outstanding`
                      : 'All invoices current',
                    icon: XCircle,
                    urgent: overdueInvoices.length > 0,
                  },
                  {
                    label: 'Cold quotes (>14 days)',
                    count: coldQuotes.length,
                    desc: coldQuotes.length > 0
                      ? `${formatCurrency(coldQuotes.reduce((s, i) => s + i.total, 0))} pipeline value`
                      : 'No cold quotes',
                    icon: Target,
                    urgent: coldQuotes.length > 0,
                  },
                  {
                    label: 'Vacant billboards',
                    count: vacantBoards.length,
                    desc: vacantBoards.length > 0
                      ? `${vacantBoards.slice(0, 2).map(b => b.name).join(', ')}${vacantBoards.length > 2 ? '…' : ''}`
                      : 'Full occupancy',
                    icon: Monitor,
                    urgent: vacantBoards.length > 0,
                  },
                  {
                    label: 'At-risk client accounts',
                    count: atRiskClients.length,
                    desc: atRiskClients.length > 0
                      ? `Expiring with no active quote`
                      : 'All accounts active',
                    icon: Shield,
                    urgent: atRiskClients.length > 0,
                  },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 px-4 py-2.5">
                    <item.icon size={14} className={item.urgent ? 'text-red-400' : 'text-emerald-400'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                      <p className="text-[11px] text-slate-400">{item.desc}</p>
                    </div>
                    <span className={`text-sm font-black ${item.urgent ? 'text-red-500' : 'text-emerald-500'}`}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Vacant boards list */}
          {vacantBoards.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-2">
                <Monitor size={13} /> Unoccupied Boards ({vacantBoards.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {vacantBoards.map(b => (
                  <span key={b.id} className="text-xs px-3 py-1 bg-white border border-amber-200 text-amber-800 rounded-full font-medium">
                    {b.name} · {b.town}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FORECAST ── */}
      {tab === 'forecast' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Current MRR', value: formatCurrency(totalMRR), icon: DollarSign, trend: null },
              { label: '3-Month Projection', value: formatCurrency(forecastData[3]?.total || 0), icon: TrendingUp, trend: 'up' },
              { label: 'Pipeline (30% weighted)', value: formatCurrency(Math.round(pipelineValue * 0.3)), icon: Target, trend: null },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <kpi.icon size={16} className="text-indigo-500" />
                  {kpi.trend === 'up' && <ArrowUpRight size={16} className="text-emerald-500" />}
                </div>
                <div className="text-2xl font-black text-slate-900">{kpi.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-1">{kpi.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-1">4-Month Revenue Forecast</h3>
            <p className="text-xs text-slate-400 mb-5">Guaranteed from active contracts + 30% probability pipeline weighting</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={forecastData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                    formatter={(val: any, name: string) => [`$${Number(val).toLocaleString()}`, name === 'guaranteed' ? 'Guaranteed' : 'Pipeline (weighted)']}
                  />
                  <Bar dataKey="guaranteed" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pipeline" stackId="a" fill="#a5b4fc" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-3 justify-center text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />Guaranteed</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-300 inline-block" />Pipeline</span>
            </div>
          </div>

          {/* Expiring revenue at risk */}
          {expiring30.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400" /> Revenue at Risk — Next 30 Days
              </h3>
              <p className="text-xs text-slate-400 mb-4">Contracts expiring without visible renewal activity</p>
              <div className="space-y-2">
                {expiring30.map(c => {
                  const client = clients.find(cl => cl.id === c.clientId);
                  const board = billboards.find(b => b.id === c.billboardId);
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-xl">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{client?.companyName || '—'}</p>
                        <p className="text-[11px] text-slate-500">{board?.name || '—'} · expires in {daysUntil(c.endDate)}d</p>
                      </div>
                      <span className="text-sm font-bold text-red-600">{formatCurrency(c.monthlyRate)}<span className="text-[10px] text-red-400">/mo</span></span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Monthly revenue at risk</span>
                <span className="text-sm font-black text-red-600">{formatCurrency(expiring30.reduce((s, c) => s + c.monthlyRate, 0))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ASSETS ── */}
      {tab === 'assets' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Boards', value: billboards.length, icon: Monitor },
              { label: 'Occupied', value: assetData.filter(a => a.occupancy > 0).length, icon: CheckCircle2 },
              { label: 'Vacant', value: vacantBoards.length, icon: XCircle },
              { label: 'Portfolio Occupancy', value: `${occupancyPct}%`, icon: BarChart2 },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center">
                <kpi.icon size={18} className="mx-auto mb-2 text-indigo-500" />
                <div className="text-2xl font-black text-slate-900">{kpi.value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Revenue by board chart */}
          {topBoards.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Top Boards by Monthly Revenue</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={topBoards.map(b => ({ name: b.name.length > 16 ? b.name.slice(0, 14) + '…' : b.name, value: b.monthlyRevenue }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}/mo`, 'Revenue']} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Full asset table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Full Portfolio</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Board', 'Town', 'Type', 'Contracts', 'Occupancy', 'Monthly Rev'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assetData.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{a.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{a.town}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.type === BillboardType.LED ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{a.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{a.contracts}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${a.occupancy >= 75 ? 'bg-emerald-400' : a.occupancy > 0 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${a.occupancy}%` }} />
                          </div>
                          <span className="text-slate-600">{a.occupancy}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{a.monthlyRevenue > 0 ? formatCurrency(a.monthlyRevenue) : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENTS ── */}
      {tab === 'clients' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Clients', value: clients.length, icon: Users },
              { label: 'Active Accounts', value: new Set(activeContracts.map(c => c.clientId)).size, icon: CheckCircle2 },
              { label: 'At Risk', value: atRiskClients.length, icon: AlertTriangle },
              { label: 'Avg CLV', value: formatCurrency(Math.round(clientData.reduce((s, c) => s + c.clv, 0) / (clientData.length || 1))), icon: DollarSign },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center">
                <kpi.icon size={18} className="mx-auto mb-2 text-indigo-500" />
                <div className="text-2xl font-black text-slate-900">{kpi.value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* At-risk clients */}
          {atRiskClients.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-red-100 bg-red-50">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-red-700">At-Risk Accounts — Contract Expiring, No Active Quote</span>
              </div>
              <div className="divide-y divide-slate-50">
                {atRiskClients.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                      <p className="text-[11px] text-slate-400">{c.contracts} active contract{c.contracts !== 1 ? 's' : ''} · expires in {c.nextExpiry}d</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-800">{formatCurrency(c.clv)}</p>
                      <p className="text-[10px] text-slate-400">lifetime value</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CLV table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Client Lifetime Value Ranking</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['#', 'Client', 'Lifetime Paid', 'Pending', 'Active Contracts', 'Next Expiry'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {topClients.map((c, i) => (
                    <tr key={c.id} className={`hover:bg-slate-50 ${c.atRisk ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-2.5 text-slate-400 font-bold">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          {c.atRisk && <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">AT RISK</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{formatCurrency(c.clv)}</td>
                      <td className="px-4 py-2.5 text-amber-600 font-medium">{c.pending > 0 ? formatCurrency(c.pending) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-slate-600">{c.contracts}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {c.nextExpiry !== null
                          ? <span className={c.nextExpiry <= 30 ? 'text-red-500 font-bold' : c.nextExpiry <= 60 ? 'text-amber-600' : ''}>{c.nextExpiry}d</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── FUNNEL ── */}
      {tab === 'funnel' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Quotes Sent', value: quotationCount + proformaCount, icon: Target },
              { label: 'Invoiced', value: invoiceCount, icon: FileText },
              { label: 'Paid / Receipted', value: paidCount + receiptCount, icon: CheckCircle2 },
              { label: 'Conversion Rate', value: `${conversionRate}%`, icon: TrendingUp },
            ].map((kpi, i) => (
              <div key={kpi.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center">
                <kpi.icon size={18} className={`mx-auto mb-2 ${i === 3 ? (conversionRate >= 50 ? 'text-emerald-500' : 'text-amber-500') : 'text-indigo-500'}`} />
                <div className={`text-2xl font-black ${i === 3 ? (conversionRate >= 50 ? 'text-emerald-600' : 'text-amber-500') : 'text-slate-900'}`}>{kpi.value}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Funnel chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Sales Funnel</h3>
              <div className="space-y-3">
                {funnelData.map((stage, i) => {
                  const pct = funnelData[0].value > 0 ? Math.round((stage.value / funnelData[0].value) * 100) : 0;
                  return (
                    <div key={stage.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{stage.name}</span>
                        <span className="font-bold text-slate-900">{stage.value} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                      </div>
                      <div className="h-7 bg-slate-100 rounded-xl overflow-hidden">
                        <div
                          className="h-full rounded-xl flex items-center px-2 transition-all"
                          style={{ width: `${Math.max(pct, 4)}%`, background: stage.fill }}
                        >
                          {pct >= 15 && <span className="text-white text-[10px] font-bold">{stage.value}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Avg Deal Size</p>
                  <p className="text-lg font-black text-slate-900">{formatCurrency(avgDealSize)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Pipeline Value</p>
                  <p className="text-lg font-black text-slate-900">{formatCurrency(pipelineValue)}</p>
                </div>
              </div>
            </div>

            {/* Funnel drop-off analysis */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Stage Analysis</h3>
              <div className="space-y-4">
                {[
                  {
                    from: 'Quotes → Invoiced',
                    rate: (quotationCount + proformaCount) > 0 ? Math.round((invoiceCount / (quotationCount + proformaCount)) * 100) : 0,
                    good: 50,
                    desc: 'Of quotes lead to an invoice',
                  },
                  {
                    from: 'Invoiced → Paid',
                    rate: invoiceCount > 0 ? Math.round((paidCount / invoiceCount) * 100) : 0,
                    good: 80,
                    desc: 'Of invoices are collected',
                  },
                  {
                    from: 'Overall Conversion',
                    rate: conversionRate,
                    good: 40,
                    desc: 'Quote-to-payment conversion',
                  },
                ].map(s => (
                  <div key={s.from}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600">{s.from}</span>
                      <span className={`font-black text-base ${s.rate >= s.good ? 'text-emerald-600' : s.rate >= s.good * 0.6 ? 'text-amber-500' : 'text-red-500'}`}>{s.rate}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.rate >= s.good ? 'bg-emerald-400' : s.rate >= s.good * 0.6 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${s.rate}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.desc}</p>
                  </div>
                ))}

                {coldQuotes.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                      <Clock size={12} /> {coldQuotes.length} quotes have gone cold
                    </p>
                    <span className="text-[10px] text-slate-400">See full report below</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cold Quotes Full Report */}
          {coldQuotes.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2">
                    <Clock size={14} /> Cold Quotes Report
                  </h3>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    {coldQuotes.length} quotes with no activity for more than 14 days &mdash; {formatCurrency(coldQuotes.reduce((s, q) => s + q.total, 0))} total at stake
                  </p>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Expired</span>
                  <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Sent / Draft</span>
                  <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />No Status</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Client', 'Ref', 'Type', 'Status', 'Days Cold', 'Expires', 'Items', 'Value'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {coldQuotes
                      .slice()
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map(q => {
                        const client = clients.find(c => c.id === q.clientId);
                        const daysCold = Math.abs(daysUntil(q.date));
                        const isExpired = q.expiryDate ? new Date(q.expiryDate) < new Date() : false;
                        const daysToExpiry = q.expiryDate ? daysUntil(q.expiryDate) : null;
                        const status = q.quoteStatus || '—';
                        const dotColor = isExpired ? 'bg-red-400' : (status === 'Sent' || status === 'Draft') ? 'bg-amber-400' : 'bg-slate-300';
                        const itemSummary = q.items
                          .slice(0, 2)
                          .map(it => it.description?.split('(')[0]?.trim() || it.description)
                          .join(', ') + (q.items.length > 2 ? ` +${q.items.length - 2}` : '');
                        return (
                          <tr key={q.id} className={`hover:bg-slate-50 ${isExpired ? 'bg-red-50/40' : ''}`}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800 whitespace-nowrap">{client?.companyName || '—'}</p>
                              {q.sentTo && <p className="text-[10px] text-slate-400 mt-0.5">{q.sentTo}</p>}
                            </td>
                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-[10px]">
                              {q.quoteNumber || q.id.slice(-6).toUpperCase()}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${q.type === 'Proforma' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                {q.type}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${dotColor}`} />
                                <span className="text-slate-600 whitespace-nowrap">{status}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold whitespace-nowrap ${daysCold >= 30 ? 'text-red-600' : daysCold >= 21 ? 'text-amber-600' : 'text-slate-700'}`}>
                                {daysCold}d
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {daysToExpiry !== null ? (
                                <span className={`text-[11px] font-medium ${isExpired ? 'text-red-500' : daysToExpiry <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                                  {isExpired ? `Expired ${Math.abs(daysToExpiry)}d ago` : `${daysToExpiry}d left`}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 max-w-[200px]">
                              <p className="text-[11px] text-slate-500 truncate">{itemSummary || '—'}</p>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                              {formatCurrency(q.total)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={7} className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Total at stake</td>
                      <td className="px-4 py-3 font-black text-slate-900 text-sm whitespace-nowrap">
                        {formatCurrency(coldQuotes.reduce((s, q) => s + q.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RECOMMENDATIONS ── */}
      {tab === 'recommendations' && (() => {
        const priorityMeta: Record<RecPriority, { label: string; color: string; bg: string; border: string; dot: string }> = {
          critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
          high:     { label: 'High',     color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500' },
          medium:   { label: 'Medium',   color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500' },
          growth:   { label: 'Growth',   color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200',dot: 'bg-emerald-500' },
        };

        const categoryIcon: Record<string, React.ElementType> = {
          'Collections':       DollarSign,
          'Renewals':          RefreshCw,
          'Client Retention':  Shield,
          'Pipeline':          Target,
          'Asset Utilisation': Monitor,
          'Risk Management':   AlertTriangle,
          'Sales Efficiency':  TrendingDown,
          'Growth':            TrendingUp,
          'Digital Inventory': Zap,
        };

        const criticalRecs  = recommendations.filter(r => r.priority === 'critical');
        const highRecs      = recommendations.filter(r => r.priority === 'high');
        const mediumRecs    = recommendations.filter(r => r.priority === 'medium');
        const growthRecs    = recommendations.filter(r => r.priority === 'growth');

        return (
          <div className="space-y-6">
            {/* DeepSeek AI Strategy Analysis */}
            {(aiAnalysisLoading || aiAnalysis) && (
              <div className="relative bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl px-5 py-4 shadow-lg shadow-violet-500/20 overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
                <div className="relative flex items-start gap-3">
                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <Zap size={15} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-white/60">DeepSeek AI Strategy Analysis</p>
                      {aiAnalysisLoading && (
                        <span className="text-[9px] font-bold text-white/40 animate-pulse">Analysing…</span>
                      )}
                    </div>
                    {aiAnalysisLoading && !aiAnalysis ? (
                      <div className="space-y-1.5">
                        <div className="h-3 bg-white/20 rounded-full w-full animate-pulse" />
                        <div className="h-3 bg-white/20 rounded-full w-4/5 animate-pulse" />
                        <div className="h-3 bg-white/20 rounded-full w-3/5 animate-pulse" />
                      </div>
                    ) : (
                      <p className="text-sm text-white leading-relaxed">{aiAnalysis}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { aiAnalysisFetched.current = false; setAiAnalysis(null); setAiAnalysisLoading(true);
                      generateBIAnalysis({
                        totalMRR, occupancyPct,
                        expiring30Count: expiring30.length, atRiskClientCount: atRiskClients.length,
                        overdueInvoiceCount: overdueInvoices.length,
                        overdueAmount: overdueInvoices.reduce((s, i) => s + i.total, 0),
                        vacantBoardCount: vacantBoards.length, totalBoards: billboards.length,
                        conversionRate, pipelineValue,
                        topRecommendations: recommendations.slice(0, 5).map(r => ({ priority: r.priority, title: r.title })),
                        estNetProfit, expenseRatio,
                      }).then(text => setAiAnalysis(text || null)).finally(() => setAiAnalysisLoading(false));
                    }}
                    className="text-white/40 hover:text-white transition-colors p-1 rounded-xl hover:bg-white/10 shrink-0"
                    title="Refresh analysis"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { label: 'Critical', count: criticalRecs.length,  ...priorityMeta.critical },
                { label: 'High',     count: highRecs.length,      ...priorityMeta.high },
                { label: 'Medium',   count: mediumRecs.length,    ...priorityMeta.medium },
                { label: 'Growth',   count: growthRecs.length,    ...priorityMeta.growth },
              ] as const).map(p => (
                <div key={p.label} className={`rounded-2xl p-4 border ${p.bg} ${p.border} flex items-center gap-3`}>
                  <span className={`w-3 h-3 rounded-full ${p.dot} shrink-0`} />
                  <div>
                    <p className={`text-xl font-black ${p.color}`}>{p.count}</p>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${p.color} opacity-70`}>{p.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {recommendations.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                <h3 className="text-sm font-bold text-slate-800 mb-1">All clear — no action items</h3>
                <p className="text-xs text-slate-400">Your portfolio is healthy. Check back as new data comes in.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec, i) => {
                  const meta  = priorityMeta[rec.priority];
                  const Icon  = categoryIcon[rec.category] || Lightbulb;
                  return (
                    <div key={rec.id} className={`bg-white rounded-2xl border ${meta.border} shadow-sm overflow-hidden`}>
                      <div className={`flex items-start gap-4 p-5`}>
                        {/* Left: number + priority dot */}
                        <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
                          <span className={`w-7 h-7 rounded-full ${meta.bg} flex items-center justify-center text-[11px] font-black ${meta.color}`}>
                            {i + 1}
                          </span>
                          <span className={`w-1 flex-1 rounded-full ${meta.dot} opacity-30 min-h-[16px]`} style={{ width: 3 }} />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Icon size={10} /> {rec.category}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 mb-1">{rec.title}</h4>
                          <p className="text-xs text-slate-500 leading-relaxed mb-3">{rec.detail}</p>

                          {/* Action box */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
                            <PhoneCall size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-0.5">Recommended Action</p>
                              <p className="text-xs text-slate-700 leading-relaxed">{rec.action}</p>
                            </div>
                          </div>
                        </div>

                        {/* Right: impact badge */}
                        <div className={`shrink-0 text-right hidden sm:block`}>
                          <div className={`px-3 py-2 rounded-xl ${meta.bg} border ${meta.border}`}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Impact</p>
                            <p className={`text-xs font-black ${meta.color} whitespace-nowrap`}>{rec.impact}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer note */}
            <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
              <Lightbulb size={11} /> Recommendations are generated automatically from live data in your portfolio.
            </p>
          </div>
        );
      })()}
    </div>
  );
};
