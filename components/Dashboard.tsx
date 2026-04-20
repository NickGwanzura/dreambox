
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ComposedChart, Line
} from 'recharts';
import {
  DollarSign, FileText, Activity, Building2, Sparkles, TrendingUp, Bell,
  AlertTriangle, Newspaper, X,
  Zap, TrendingDown, CheckCircle2, Clock, CreditCard, ArrowUpRight, ArrowDownRight, RefreshCw, Wallet
} from 'lucide-react';
import { getContracts, getInvoices, getBillboards, getClients, getExpenses, getExpiringContracts, getOverdueInvoices, getUpcomingBillings, getFinancialTrends, subscribe } from '../services/mockData';
import { BillboardType } from '../types';
import { generateGreeting, fetchIndustryNews } from '../services/aiService';
import { getCurrentUser } from '../services/authServiceSecure';
import { logger } from '../utils/logger';

const typeIs = (val: any, target: string) => String(val || '').toLowerCase() === target.toLowerCase();

export const Dashboard: React.FC = () => {
  const [greeting, setGreeting] = useState('');
  const [news, setNews] = useState<Array<{ title: string; summary: string; source?: string; date?: string }>>([]);
  const [selectedNews, setSelectedNews] = useState<{ title: string; summary: string; source?: string; date?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const currentUser = getCurrentUser();

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setRefreshKey(prev => prev + 1);
      setLastUpdated(new Date());
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchGreeting = async () => {
      if (currentUser?.firstName) {
        try {
          const greet = await generateGreeting(currentUser.firstName);
          if (isMounted) setGreeting(greet);
        } catch (e) { logger.error('Greeting failed:', e); }
      }
    };
    const loadNews = async () => {
      try {
        const items = await fetchIndustryNews();
        if (isMounted) setNews(items);
      } catch (e) { logger.error('News failed:', e); }
    };
    fetchGreeting();
    loadNews();
    return () => { isMounted = false; };
  }, [currentUser?.firstName]);

  const contracts  = useMemo(() => getContracts(),  [refreshKey]);
  const invoices   = useMemo(() => getInvoices(),   [refreshKey]);
  const billboards = useMemo(() => getBillboards(), [refreshKey]);
  const clients    = useMemo(() => getClients(),    [refreshKey]);
  const expenses   = useMemo(() => getExpenses(),   [refreshKey]);

  const metrics = useMemo(() => {
    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear  = today.getFullYear();
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    const activeContractsList = contracts.filter(c =>
      c.status === 'Active' &&
      new Date(c.startDate) <= today &&
      new Date(c.endDate) >= today
    );

    // MRR = sum of monthly rates for active contracts (rates are VAT-inclusive)
    const mrr = activeContractsList.reduce((sum, c) => sum + c.monthlyRate, 0);

    // Outstanding balance = all pending + overdue invoices
    const outstanding = invoices
      .filter(i => typeIs(i.type, 'Invoice') && (i.status === 'Pending' || i.status === 'Overdue'))
      .reduce((sum, i) => sum + i.total, 0);

    // Collected this month (receipts)
    const collectedThisMonth = invoices
      .filter(i => {
        const d = new Date(i.date);
        return typeIs(i.type, 'Receipt') && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((sum, i) => sum + i.total, 0);

    // Collected last month
    const collectedLastMonth = invoices
      .filter(i => {
        const d = new Date(i.date);
        return typeIs(i.type, 'Receipt') && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
      })
      .reduce((sum, i) => sum + i.total, 0);

    // Billed this month
    const billedThisMonth = invoices
      .filter(i => {
        const d = new Date(i.date);
        return typeIs(i.type, 'Invoice') && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((sum, i) => sum + i.total, 0);

    // Billed last month
    const billedLastMonth = invoices
      .filter(i => {
        const d = new Date(i.date);
        return typeIs(i.type, 'Invoice') && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
      })
      .reduce((sum, i) => sum + i.total, 0);

    const activeContractsCount = activeContractsList.length;
    const lastMonthActiveContracts = contracts.filter(c => {
      const s = new Date(c.startDate), e = new Date(c.endDate);
      return c.status === 'Active' && s <= lastMonthDate && e >= lastMonthDate;
    }).length;

    // Occupancy
    const ledBillboards    = billboards.filter(b => b.type === BillboardType.LED);
    const staticBillboards = billboards.filter(b => b.type === BillboardType.Static);
    const totalLedSlots    = ledBillboards.reduce((acc, b) => acc + (b.totalSlots || 0), 0);
    const rentedLedSlots   = ledBillboards.reduce((acc, b) => acc + activeContractsList.filter(c => c.billboardId === b.id).length, 0);
    const totalStaticSides = staticBillboards.length * 2;
    const rentedStaticSides = staticBillboards.reduce((acc, b) => {
      const billboardContracts = activeContractsList.filter(c => c.billboardId === b.id);
      // Contracts with explicit side
      const sideA = billboardContracts.some(c => c.side === 'A' || c.side === 'Both');
      const sideB = billboardContracts.some(c => c.side === 'B' || c.side === 'Both');
      let count = (sideA ? 1 : 0) + (sideB ? 1 : 0);
      // Contracts with no side set — each counts as 1 occupied side (capped at remaining available)
      const nullSideCount = billboardContracts.filter(c => !c.side).length;
      if (nullSideCount > 0) {
        const remaining = 2 - count;
        count = Math.min(2, count + Math.min(nullSideCount, remaining));
      }
      return acc + count;
    }, 0);
    const totalSlots  = totalLedSlots + totalStaticSides;
    const rentedSlots = rentedLedSlots + rentedStaticSides;
    const occupancyRate        = totalSlots > 0 ? Math.round((rentedSlots / totalSlots) * 100) : 0;
    const digitalOccupancyRate = totalLedSlots > 0 ? Math.round((rentedLedSlots / totalLedSlots) * 100) : 0;
    const staticOccupancyRate  = totalStaticSides > 0 ? Math.round((rentedStaticSides / totalStaticSides) * 100) : 0;

    // Top clients
    const topClientsData = clients
      .map(c => ({ name: c.companyName, value: invoices.filter(i => i.clientId === c.id && typeIs(i.type, 'Invoice')).reduce((s, i) => s + i.total, 0) }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    const totalRevenue = invoices.filter(i => typeIs(i.type, 'Invoice')).reduce((s, i) => s + i.total, 0);

    // Revenue by location
    const revenueByTownData = billboards
      .reduce((acc: any[], b) => {
        const rev = contracts.filter(c => c.billboardId === b.id && c.status === 'Active').reduce((s, c) => s + c.totalContractValue, 0);
        const ex = acc.find(x => x.name === b.town);
        if (ex) ex.value += rev; else acc.push({ name: b.town, value: rev });
        return acc;
      }, []).sort((a, b) => b.value - a.value).slice(0, 5);

    // Recent activity: last 6 receipts/paid invoices
    const recentPayments = invoices
      .filter(i => typeIs(i.type, 'Receipt'))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    // Expenses this month
    const expensesThisMonth = expenses
      .filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const expensesLastMonth = expenses
      .filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    // Expense breakdown by category (this month)
    const expenseByCategory = expenses
      .filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {});

    const expenseByCategoryData = Object.entries(expenseByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Recent expenses (last 5)
    const recentExpenses = [...expenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    // MoM changes
    const mrrChange = collectedLastMonth > 0
      ? Math.round(((collectedThisMonth - collectedLastMonth) / collectedLastMonth) * 100)
      : collectedThisMonth > 0 ? 100 : 0;
    const contractsChange = lastMonthActiveContracts > 0
      ? Math.round(((activeContractsCount - lastMonthActiveContracts) / lastMonthActiveContracts) * 100)
      : 0;
    const billedChange = billedLastMonth > 0
      ? Math.round(((billedThisMonth - billedLastMonth) / billedLastMonth) * 100)
      : billedThisMonth > 0 ? 100 : 0;
    const expenseChange = expensesLastMonth > 0
      ? Math.round(((expensesThisMonth - expensesLastMonth) / expensesLastMonth) * 100)
      : expensesThisMonth > 0 ? 100 : 0;

    return {
      mrr, outstanding, collectedThisMonth, billedThisMonth,
      activeContractsCount, totalRevenue,
      ledBillboards: ledBillboards.length, staticBillboards: staticBillboards.length,
      totalLedSlots, rentedLedSlots, digitalOccupancyRate,
      totalStaticSides, rentedStaticSides, staticOccupancyRate, occupancyRate,
      totalSlots, rentedSlots,
      topClientsData, revenueByTownData, recentPayments,
      mrrChange, contractsChange, billedChange,
      expensesThisMonth, expenseChange, expenseByCategoryData, recentExpenses,
    };
  }, [contracts, invoices, billboards, clients, expenses]);

  const { expiringContracts, overdueInvoices, upcomingBillings } = useMemo(() => ({
    expiringContracts: getExpiringContracts(),
    overdueInvoices:   getOverdueInvoices(),
    upcomingBillings:  getUpcomingBillings().slice(0, 3),
  }), [refreshKey]);

  const financialTrends = useMemo(() => {
    // Enrich trends with collected (receipts) per month
    const base = getFinancialTrends();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date();
    return base.map((entry, i) => {
      const monthIndex = (today.getMonth() - (5 - i) + 12) % 12;
      const year = today.getFullYear() - (today.getMonth() - (5 - i) < 0 ? 1 : 0);
      const collected = invoices
        .filter(inv => {
          const d = new Date(inv.date);
          return typeIs(inv.type, 'Receipt') && d.getMonth() === monthIndex && d.getFullYear() === year;
        })
        .reduce((sum, inv) => sum + inv.total, 0);
      return { ...entry, collected };
    });
  }, [refreshKey, invoices]);

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown', [clients]);

  const maxTopClient = metrics.topClientsData[0]?.value || 1;

  const catColors: Record<string, string> = {
    'Promo Launch': 'bg-emerald-50 text-emerald-700',
    'Industry':     'bg-indigo-50 text-indigo-700',
    'Regulation':   'bg-amber-50 text-amber-700',
    'Technology':   'bg-blue-50 text-blue-700',
  };

  return (
    <div className="space-y-6 animate-fade-in pb-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting || `Welcome back${currentUser?.firstName ? `, ${currentUser.firstName}` : ''}`}</h1>
          <p className="text-slate-500 mt-0.5 text-sm">Here's what's happening with your billboard business today.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <RefreshCw size={12} />
          <span>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Monthly Recurring"
          value={`$${Math.round(metrics.mrr).toLocaleString()}`}
          subtitle="Active contract MRR"
          icon={Zap}
          color="indigo"
          change={metrics.mrrChange !== 0 ? `${metrics.mrrChange > 0 ? '+' : ''}${metrics.mrrChange}%` : undefined}
          trend={metrics.mrrChange >= 0 ? 'up' : 'down'}
        />
        <KPICard
          title="Collected This Month"
          value={`$${Math.round(metrics.collectedThisMonth).toLocaleString()}`}
          subtitle={`Billed: $${Math.round(metrics.billedThisMonth).toLocaleString()}`}
          icon={CreditCard}
          color="emerald"
          change={metrics.billedChange !== 0 ? `${metrics.billedChange > 0 ? '+' : ''}${metrics.billedChange}% billed` : undefined}
          trend={metrics.billedChange >= 0 ? 'up' : 'down'}
        />
        <KPICard
          title="Outstanding Balance"
          value={`$${Math.round(metrics.outstanding).toLocaleString()}`}
          subtitle={`${overdueInvoices.length} overdue`}
          icon={DollarSign}
          color={metrics.outstanding > 0 ? 'amber' : 'emerald'}
          alert={overdueInvoices.length > 0}
        />
        <KPICard
          title="Active Contracts"
          value={metrics.activeContractsCount.toString()}
          subtitle={`${metrics.occupancyRate}% occupancy`}
          icon={FileText}
          color="blue"
          change={metrics.contractsChange !== 0 ? `${metrics.contractsChange > 0 ? '+' : ''}${metrics.contractsChange}%` : undefined}
          trend={metrics.contractsChange >= 0 ? 'up' : 'down'}
        />
        <KPICard
          title="Expenses This Month"
          value={`$${Math.round(metrics.expensesThisMonth).toLocaleString()}`}
          subtitle={`${metrics.expenseByCategoryData.length} categories`}
          icon={Wallet}
          color="red"
          change={metrics.expenseChange !== 0 ? `${metrics.expenseChange > 0 ? '+' : ''}${metrics.expenseChange}%` : undefined}
          trend={metrics.expenseChange <= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Main */}
        <div className="lg:col-span-2 space-y-6">

          {/* Financial Performance Chart */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Financial Performance</h3>
                <p className="text-sm text-slate-500">Billed vs Collected, last 6 months</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-800 inline-block"></span>Billed</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block"></span>Collected</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-500 inline-block rounded"></span>Net</span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financialTrends} barGap={4}>
                  <defs>
                    <linearGradient id="billedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity={0.85}/>
                      <stop offset="100%" stopColor="#1e293b" stopOpacity={0.3}/>
                    </linearGradient>
                    <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                    formatter={(val: any, name: string) => [`$${Number(val).toLocaleString()}`, name === 'revenue' ? 'Billed' : name === 'collected' ? 'Collected' : 'Net Margin']}
                  />
                  <Bar dataKey="revenue"   barSize={18} fill="url(#billedGrad)"    radius={[5, 5, 0, 0]} />
                  <Bar dataKey="collected" barSize={18} fill="url(#collectedGrad)" radius={[5, 5, 0, 0]} />
                  <Line type="monotone" dataKey="margin" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Occupancy + Location Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Occupancy</h3>
              <div className="grid grid-cols-3 gap-3">
                <OccupancyRing title="Overall"    percentage={metrics.occupancyRate}        color="#6366f1" subtitle={`${metrics.rentedSlots}/${metrics.totalSlots}`} />
                <OccupancyRing title="LED"        percentage={metrics.digitalOccupancyRate} color="#3b82f6" subtitle={`${metrics.rentedLedSlots}/${metrics.totalLedSlots}`}       bgColor="bg-blue-50" />
                <OccupancyRing title="Static"     percentage={metrics.staticOccupancyRate}  color="#10b981" subtitle={`${metrics.rentedStaticSides}/${metrics.totalStaticSides}`} bgColor="bg-emerald-50" />
              </div>
              {/* Inventory summary */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                <span><strong className="text-slate-700">{metrics.ledBillboards}</strong> LED screens</span>
                <span><strong className="text-slate-700">{metrics.staticBillboards}</strong> static boards</span>
                <span><strong className="text-slate-700">{metrics.ledBillboards + metrics.staticBillboards}</strong> total</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Revenue by Location</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.revenueByTownData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={70} />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Revenue']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                      {metrics.revenueByTownData.map((_, i) => (
                        <Cell key={i} fill={['#6366f1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff'][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Clients */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">Top Clients</h3>
              <span className="text-xs text-slate-400">by total billed</span>
            </div>
            <div className="space-y-3">
              {metrics.topClientsData.map((client, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-slate-900 truncate">{client.name}</span>
                      <span className="text-sm font-bold text-slate-900 ml-2 shrink-0">${client.value.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(client.value / maxTopClient) * 100}%`, backgroundColor: ['#6366f1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff'][i] }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {metrics.topClientsData.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No revenue data yet</p>
              )}
            </div>
          </div>

          {/* Expense Breakdown + Recent Expenses */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-red-500" />
                  <h3 className="text-lg font-bold text-slate-900">Expenses by Category</h3>
                </div>
                <span className="text-xs text-slate-400">this month</span>
              </div>
              {metrics.expenseByCategoryData.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const maxExp = metrics.expenseByCategoryData[0]?.value || 1;
                    const catColors: Record<string, string> = {
                      Maintenance: '#ef4444', Printing: '#f59e0b', Electricity: '#3b82f6', Labor: '#8b5cf6', Other: '#64748b',
                    };
                    return metrics.expenseByCategoryData.map((cat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-20 text-xs font-semibold text-slate-600 shrink-0 truncate">{cat.name}</div>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(cat.value / maxExp) * 100}%`, backgroundColor: catColors[cat.name] || '#64748b' }} />
                        </div>
                        <span className="text-xs font-bold text-slate-900 w-16 text-right shrink-0">${cat.value.toLocaleString()}</span>
                      </div>
                    ));
                  })()}
                  <div className="pt-3 border-t border-slate-100 flex justify-between text-sm">
                    <span className="text-slate-500 font-medium">Total</span>
                    <span className="font-bold text-slate-900">${Math.round(metrics.expensesThisMonth).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">No expenses recorded this month</p>
              )}
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown size={16} className="text-red-500" />
                <h3 className="font-bold text-slate-900">Recent Expenses</h3>
              </div>
              <div className="space-y-2">
                {metrics.recentExpenses.length > 0 ? metrics.recentExpenses.map((exp, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{exp.description}</p>
                      <p className="text-[10px] text-slate-400">{exp.date} · {exp.category}</p>
                    </div>
                    <span className="text-xs font-bold text-red-600 ml-2 shrink-0">-${exp.amount.toLocaleString()}</span>
                  </div>
                )) : (
                  <p className="text-xs text-slate-400 text-center py-4">No expenses recorded yet</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right / Sidebar */}
        <div className="space-y-6">

          {/* Action Required */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">Action Required</h3>
              {(expiringContracts.length + overdueInvoices.length) > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                  {expiringContracts.length + overdueInvoices.length}
                </span>
              )}
            </div>

            {upcomingBillings.length > 0 && (
              <div className="mb-4 pb-4 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Upcoming Collections</h4>
                <div className="space-y-2">
                  {upcomingBillings.map((bill, i) => (
                    <div key={i} className="flex justify-between items-center p-2.5 bg-indigo-50 rounded-xl">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{bill.clientName}</p>
                        <p className="text-[10px] text-slate-500">Due {bill.date}</p>
                      </div>
                      <span className="text-xs font-bold text-indigo-600">${bill.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overdueInvoices.length > 0 && (
              <div className="mb-4 pb-4 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">Overdue Payments</h4>
                <div className="space-y-2">
                  {overdueInvoices.slice(0, 3).map(inv => (
                    <div key={inv.id} className="flex justify-between items-center p-2.5 bg-red-50 rounded-xl">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{getClientName(inv.clientId)}</p>
                        <p className="text-[10px] text-slate-500">{inv.date}</p>
                      </div>
                      <span className="text-xs font-bold text-red-600">${inv.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expiringContracts.length > 0 && (
              <div className="mb-2">
                <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-2">Expiring Contracts</h4>
                <div className="space-y-2">
                  {expiringContracts.map(c => (
                    <div key={c.id} className="flex items-start gap-2.5 p-2.5 bg-amber-50 rounded-xl">
                      <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{getClientName(c.clientId)}</p>
                        <p className="text-[10px] text-slate-500">Expires {c.endDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expiringContracts.length === 0 && overdueInvoices.length === 0 && upcomingBillings.length === 0 && (
              <div className="py-6 text-center bg-slate-50 rounded-2xl">
                <CheckCircle2 size={22} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">All caught up!</p>
                <p className="text-xs text-slate-400 mt-0.5">No actions required</p>
              </div>
            )}
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">Recent Payments</h3>
            </div>
            <div className="space-y-2">
              {metrics.recentPayments.length > 0 ? metrics.recentPayments.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{getClientName(r.clientId)}</p>
                    <p className="text-[10px] text-slate-400">{r.date} · {r.paymentMethod || 'Payment'}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 ml-2 shrink-0">+${r.total.toLocaleString()}</span>
                </div>
              )) : (
                <p className="text-xs text-slate-400 text-center py-4">No payments recorded yet</p>
              )}
            </div>
          </div>

          {/* Industry News */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper size={16} className="text-indigo-600" />
                <h3 className="font-bold text-slate-900">Industry News</h3>
              </div>
              {news.length > 0 && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{news.length} stories</span>}
            </div>
            <div className="space-y-2">
              {news.length > 0 ? news.map((item, idx) => {
                const catStyle = catColors[(item as any).category] || 'bg-slate-100 text-slate-600';
                return (
                  <div key={idx} className="cursor-pointer group p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100" onClick={() => setSelectedNews(item)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${catStyle}`}>{(item as any).category || item.source || 'News'}</span>
                      <span className="text-[10px] text-slate-400">{item.date}</span>
                    </div>
                    <h4 className="text-xs font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">{item.title}</h4>
                  </div>
                );
              }) : (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="animate-pulse space-y-1.5 p-3">
                      <div className="h-3 w-20 bg-slate-100 rounded-full" />
                      <div className="h-4 w-full bg-slate-100 rounded" />
                      <div className="h-3 w-3/4 bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* News Modal */}
      {selectedNews && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedNews(null)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const catStyle = catColors[(selectedNews as any).category] || 'bg-slate-100 text-slate-600';
                  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${catStyle}`}>{(selectedNews as any).category || selectedNews.source || 'News'}</span>;
                })()}
                {selectedNews.date && <span className="text-[10px] text-slate-400">{selectedNews.date}</span>}
              </div>
              <button onClick={() => setSelectedNews(null)} className="shrink-0 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <h2 className="text-xl font-bold text-slate-900 leading-snug mb-4">{selectedNews.title}</h2>
              <div className="space-y-3">
                {selectedNews.summary.split(/\n\n+/).map((para, i) => (
                  <p key={i} className="text-sm text-slate-600 leading-relaxed">{para.trim()}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KPICard: React.FC<{
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  subtitle?: string;
  icon: any;
  color: 'indigo' | 'emerald' | 'blue' | 'amber' | 'red';
  alert?: boolean;
}> = ({ title, value, change, trend, subtitle, icon: Icon, color, alert }) => {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue:   'bg-blue-50 text-blue-600',
    red:    'bg-red-50 text-red-600',
    amber:  'bg-amber-50 text-amber-600',
  };
  return (
    <div className={`bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${alert ? 'border-amber-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${colors[color]}`}>
          <Icon size={18} />
        </div>
        {change && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {change}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-black text-slate-900 mt-1 leading-tight">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
};

// ── Occupancy Ring ────────────────────────────────────────────────────────────
const OccupancyRing: React.FC<{
  title: string;
  percentage: number;
  color: string;
  subtitle: string;
  bgColor?: string;
}> = ({ title, percentage, color, subtitle, bgColor = 'bg-slate-50' }) => (
  <div className={`${bgColor} rounded-2xl p-3 text-center`}>
    <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wide">{title}</p>
    <div className="relative w-14 h-14 mx-auto">
      <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="24" stroke="#e2e8f0" strokeWidth="4" fill="transparent" />
        <circle cx="28" cy="28" r="24" stroke={color} strokeWidth="4" fill="transparent"
          strokeDasharray={`${percentage * 1.508} 150.8`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black" style={{ color }}>{percentage}%</span>
      </div>
    </div>
    <p className="text-[10px] text-slate-400 mt-1.5 font-medium">{subtitle}</p>
  </div>
);
