import React from 'react';
import { getInvoices, getExpenses, printingJobs, outsourcedBillboards, getFinancialTrends, getBillboards, getContracts } from '../services/mockData';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Wallet, Activity, FileText, Receipt } from 'lucide-react';
import { BillboardType } from '../types';
import { getTotalMonthlyRecurringRevenue, getTotalOneTimeRevenue, getTotalCOGS, getGrossProfit, getNetProfit, getClientProfitability, getContractProfitability, getMonthlyProfitTrends, formatCurrency, formatPercent } from '../services/profitAnalytics';

export const Analytics: React.FC = () => {
    // 1. Calculate Revenue with proper classification
    const totalRevenue = getInvoices()
        .filter(i => String(i.type || '').toLowerCase() === 'invoice' && !i.isVoided)
        .reduce((acc, curr) => acc + (curr.subtotal ?? 0), 0);

    const recurringRevenue = getTotalMonthlyRecurringRevenue() * 6; // Approximate 6-month MRR total for comparison
    const oneTimeRevenue = getTotalOneTimeRevenue();

    // 2. Calculate COGS properly (includes installation, printing, production, outsourced, operational)
    const totalCOGS = getTotalCOGS();

    // 3. Profit metrics
    const grossProfit = getGrossProfit().grossProfit;
    const grossMargin = getGrossProfit().grossMargin;
    const netProfit = getNetProfit();

    // 4. Per-client profitability for top clients chart
    const clientProfitData = getClientProfitability()
        .slice(0, 5)
        .map(c => ({
            name: c.clientName.length > 15 ? c.clientName.substring(0, 12) + '...' : c.clientName,
            profit: c.grossProfit,
            revenue: c.revenue,
            margin: c.grossMargin,
        }));

    // 5. Per-contract profitability for table
    const contractProfitData = getContractProfitability()
        .slice(0, 10)
        .map(c => ({
            ...c,
            grossProfit: Math.round(c.grossProfit),
            oneTimeRevenue: Math.round(c.oneTimeRevenue),
            totalRevenue: Math.round(c.totalRevenue),
        }));

    // 3. Calculate Occupancy Metrics
    const billboards = getBillboards();
    const ledBillboards = billboards.filter(b => b.type === BillboardType.LED);
    const totalLedSlots = ledBillboards.reduce((acc, b) => acc + (b.totalSlots || 0), 0);
    const rentedLedSlots = ledBillboards.reduce((acc, b) => acc + (b.rentedSlots || 0), 0);
    const digitalOccupancyRate = totalLedSlots > 0 ? ((rentedLedSlots / totalLedSlots) * 100).toFixed(1) : '0';

    const staticBillboards = billboards.filter(b => b.type === BillboardType.Static);
    const totalStaticSides = staticBillboards.length * 2;
    const activeContractsList = getContracts().filter(c => String(c.status || '').toLowerCase() === 'active');
    const rentedStaticSides = staticBillboards.reduce((acc, b) => {
      const billboardContracts = activeContractsList.filter(c => c.billboardId === b.id);
      const sideA = billboardContracts.some(c => c.side === 'A' || c.side === 'Both');
      const sideB = billboardContracts.some(c => c.side === 'B' || c.side === 'Both');
      let count = (sideA ? 1 : 0) + (sideB ? 1 : 0);
      const nullSideCount = billboardContracts.filter(c => !c.side).length;
      if (nullSideCount > 0) {
        const remaining = 2 - count;
        count = Math.min(2, count + Math.min(nullSideCount, remaining));
      }
      return acc + count;
    }, 0);
    const staticOccupancyRate = totalStaticSides > 0 ? ((rentedStaticSides / totalStaticSides) * 100).toFixed(1) : '0';

    // Expense breakdown (for pie chart)
    const operationalExpenses = getExpenses().reduce((acc, curr) => acc + curr.amount, 0);
    const printingExpenses = printingJobs.reduce((acc, curr) => acc + curr.totalCost, 0);
    const outsourcedPayouts = outsourcedBillboards.reduce((acc, curr) => acc + (curr.monthlyPayout * 12), 0);

    const expenseBreakdown = [
        { name: 'Installation', value: getContracts().reduce((s, c) => s + (c.installationCost || 0), 0) },
        { name: 'Printing', value: Math.max(printingExpenses, getContracts().reduce((s, c) => s + (c.printingCost || 0), 0)) },
        { name: 'Production', value: getContracts().reduce((s, c) => s + (c.productionCost || 0), 0) },
        { name: 'Outsourced', value: outsourcedPayouts },
        { name: 'Operational', value: operationalExpenses },
    ].filter(e => e.value > 0);

    // Use dynamic trend data derived from actual invoices/expenses with proper profit splitting
    const monthlyData = getMonthlyProfitTrends().map(m => ({
        month: m.month,
        revenue: m.revenue,
        grossProfit: m.grossProfit,
        cogs: m.cogs,
    })).filter(d => !d.month.includes('Proj'));

    const COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Profit Analytics</h2>
                <p className="text-slate-900 font-medium">Deep dive into financial health, margins, and expense distribution</p>
            </div>

            {/* Scorecards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Net Invoiced Revenue</p>
                    <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">${totalRevenue.toLocaleString()}</h3>
                    <p className="text-xs text-slate-900 mt-2 font-medium">
                        VAT excluded; voided invoices excluded
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Direct COGS Estimate</p>
                    <h3 className="text-4xl font-extrabold text-red-600 tracking-tight">${totalCOGS.toLocaleString()}</h3>
                    <p className="text-xs text-slate-900 mt-2 font-medium">
                        Installation + printing + production + outsourced costs
                    </p>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl shadow-lg border border-slate-800 text-white hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Gross Profit</p>
                    <h3 className="text-4xl font-extrabold text-white tracking-tight">${grossProfit.toLocaleString()}</h3>
                    <div className="mt-4 flex justify-between items-center">
                        <span className="text-xs text-slate-900 font-medium">Margin</span>
                        <span className={`font-bold ${grossMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{grossMargin.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* Occupancy Scorecards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-25 p-6 rounded-2xl shadow-sm border border-blue-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-100 rounded-xl text-blue-600"><Activity size={20} /></div>
                        <span className="text-xs font-bold px-3 py-1 bg-blue-600 text-white rounded-full">{totalLedSlots > 0 ? `${rentedLedSlots} / ${totalLedSlots}` : 'N/A'}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Digital (LED) Occupancy</p>
                    <h3 className="text-4xl font-extrabold text-blue-900 tracking-tight">{totalLedSlots > 0 ? digitalOccupancyRate : '—'}%</h3>
                    <p className="text-xs text-blue-600 mt-2 font-medium">{totalLedSlots > 0 ? 'Slots booked out of total capacity' : 'No digital billboards'}</p>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-25 p-6 rounded-2xl shadow-sm border border-red-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-red-100 rounded-xl text-red-600"><Activity size={20} /></div>
                        <span className="text-xs font-bold px-3 py-1 bg-red-600 text-white rounded-full">{totalStaticSides > 0 ? `${rentedStaticSides} / ${totalStaticSides}` : 'N/A'}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Static (Print) Occupancy</p>
                    <h3 className="text-4xl font-extrabold text-red-900 tracking-tight">{totalStaticSides > 0 ? staticOccupancyRate : '—'}%</h3>
                    <p className="text-xs text-red-600 mt-2 font-medium">{totalStaticSides > 0 ? 'Sides rented out of total sides' : 'No static billboards'}</p>
                </div>
            </div>

            {/* Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Gross Profit Trend (Last 6 Months)</h3>
                    <div className="h-72">
                         {monthlyData.length > 0 ? (
                             <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                 <AreaChart data={monthlyData}>
                                     <defs>
                                     <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                         <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                         <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                     </linearGradient>
                                     <linearGradient id="colorCOGS" x1="0" y1="0" x2="0" y2="1">
                                         <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                                         <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                     </linearGradient>
                                     <linearGradient id="colorGrossProfit" x1="0" y1="0" x2="0" y2="1">
                                         <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                         <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                     </linearGradient>
                                     </defs>
                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                     <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                                     <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                                     <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                     <Area type="monotone" dataKey="revenue" stackId="1" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                                     <Area type="monotone" dataKey="cogs" stackId="2" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorCOGS)" />
                                     <Area type="monotone" dataKey="grossProfit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorGrossProfit)" />
                                 </AreaChart>
                             </ResponsiveContainer>
                         ) : (
                             <div className="flex items-center justify-center h-full text-slate-900">No data available yet.</div>
                         )}
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Top Clients by Gross Profit</h3>
                    <div className="h-72">
                         {clientProfitData.length > 0 ? (
                             <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                  <BarChart data={clientProfitData} layout="vertical">
                                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                      <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} width={100} />
                                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Gross Profit']} />
                                      <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                                          {clientProfitData.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={entry.margin >= 30 ? '#10b981' : entry.margin >= 15 ? '#f59e0b' : '#ef4444'} />
                                          ))}
                                      </Bar>
                                  </BarChart>
                             </ResponsiveContainer>
                         ) : (
                             <div className="flex items-center justify-center h-full text-slate-900">No client profitability data available.</div>
                         )}
                    </div>
                </div>
            </div>

            {/* Contract Profitability Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Contract Profitability</h3>
                        <p className="text-xs text-slate-900 mt-1">Gross profit per contract (revenue − one-time costs)</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-900">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Contract</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Client</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Revenue</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">One-Time Costs</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Gross Profit</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {contractProfitData.length > 0 ? contractProfitData.map((c, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-slate-800 text-xs" title={c.contractId}>
                                        #{c.contractId.substring(0, 8)}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-800">
                                        {c.clientName}
                                        <div className="text-xs text-slate-900">{c.billboardName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium">${c.totalRevenue.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-red-600 font-medium">
                                        -${c.oneTimeRevenue.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                        ${c.grossProfit.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${c.grossMargin >= 30 ? 'bg-emerald-100 text-emerald-700' : c.grossMargin >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                            {c.grossMargin.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-900">No contract data available.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Monthly Performance Report */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">Monthly Performance Report</h3>
                    <button className="text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors uppercase tracking-wider">Download CSV</button>
                </div>
                 <table className="w-full text-left text-sm text-slate-900">
                     <thead className="bg-slate-50 border-b border-slate-100">
                         <tr>
                             <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider">Month</th>
                             <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Revenue</th>
                             <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">COGS</th>
                             <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Gross Profit</th>
                             <th className="px-6 py-4 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Margin</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {monthlyData.length > 0 ? monthlyData.map((data, i) => (
                              <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 font-bold text-slate-800">{data.month}</td>
                                  <td className="px-6 py-4 text-right font-medium">${data.revenue.toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right text-red-600 font-medium">${data.cogs.toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right font-bold text-emerald-600">${data.grossProfit.toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right">{data.revenue > 0 ? ((data.grossProfit/data.revenue)*100).toFixed(1) : 0}%</td>
                              </tr>
                         )) : (
                             <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-900">No data available for report.</td></tr>
                         )}
                     </tbody>
                 </table>
            </div>
        </div>
    )
}
