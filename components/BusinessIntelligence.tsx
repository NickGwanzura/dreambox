import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  AlertTriangle, TrendingUp, Users, Monitor, DollarSign, FileText,
  Clock, CheckCircle2, XCircle, ArrowUpRight, Zap, Shield, Target, BarChart2
} from 'lucide-react';
import {
  getContracts, getInvoices, getClients, getBillboards,
} from '../services/mockData';
import { BillboardType } from '../types';
import { formatCurrency } from '../services/profitAnalytics';

type BITab = 'overview' | 'forecast' | 'assets' | 'clients' | 'funnel';

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

  const contracts = useMemo(() => getContracts(), []);
  const invoices = useMemo(() => getInvoices(), []);
  const clients = useMemo(() => getClients(), []);
  const billboards = useMemo(() => getBillboards(), []);

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
  const paidInvoiceTotal = invoices.filter(i => i.status === 'Paid' && i.type === 'Invoice').reduce((s, i) => s + i.total, 0);
  const pendingInvoiceTotal = invoices.filter(i => i.status === 'Pending' && i.type === 'Invoice').reduce((s, i) => s + i.total, 0);

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
      const clv = clInvoices.reduce((s, i) => s + (i.status === 'Paid' ? i.total : 0), 0);
      const pending = clInvoices.reduce((s, i) => s + (i.status === 'Pending' ? i.total : 0), 0);
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

  // ─────────────────────────────────────────────────────────────────────────

  const tabs: { id: BITab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'assets', label: 'Assets' },
    { id: 'clients', label: 'Clients' },
    { id: 'funnel', label: 'Sales Funnel' },
  ];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Business Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">Forward-looking signals, forecasts, and asset intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5">
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
            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
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
                <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                  <kpi.icon size={16} className={kpi.color} />
                </div>
                <div className="text-xl font-black text-slate-900">{kpi.value}</div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{kpi.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">{kpi.sub}</div>
              </div>
            ))}
          </div>

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
                    <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg">
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
                      <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg flex items-center px-2 transition-all"
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
    </div>
  );
};
