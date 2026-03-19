
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, ComposedChart, Line
} from 'recharts';
import { 
  DollarSign, FileText, Activity, Users, Sparkles, TrendingUp, Bell, 
  AlertTriangle, Calendar, ArrowRight, Newspaper, X,
  MapPin, Building2, Zap, Target, CreditCard, TrendingDown, ChevronRight
} from 'lucide-react';
import { getContracts, getInvoices, getBillboards, getClients, getExpiringContracts, getOverdueInvoices, getUpcomingBillings, getFinancialTrends, subscribe } from '../services/mockData';
import { BillboardType } from '../types';
import { generateGreeting, fetchIndustryNews } from '../services/aiService';
import { getCurrentUser } from '../services/authServiceSecure';
import { useSafeAsync } from '../utils/useSafeAsync';
import { logger } from '../utils/logger';

export const Dashboard: React.FC = () => {
  const [greeting, setGreeting] = useState('');
  const [news, setNews] = useState<Array<{ title: string; summary: string; source?: string; date?: string }>>([]);
  const [selectedNews, setSelectedNews] = useState<{ title: string; summary: string; source?: string; date?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentUser = getCurrentUser();
  const { run: runAsync } = useSafeAsync();

  // Real-time subscription
  useEffect(() => {
    let isSubscribed = true;
    const unsubscribe = subscribe(() => {
      if (isSubscribed) setRefreshKey(prev => prev + 1);
    });
    return () => { isSubscribed = false; unsubscribe(); };
  }, []);

  // Fetch greeting and news
  useEffect(() => {
    let isMounted = true;
    const fetchGreeting = async () => {
      if (currentUser?.firstName && isMounted) {
        try {
          const greet = await generateGreeting(currentUser.firstName);
          if (isMounted) setGreeting(greet);
        } catch (error) {
          logger.error('Failed to fetch greeting:', error);
        }
      }
    };
    const loadNews = async () => {
      try {
        const newsItems = await fetchIndustryNews();
        if (isMounted) setNews(newsItems);
      } catch (error) {
        logger.error('Failed to fetch news:', error);
      }
    };
    fetchGreeting();
    loadNews();
    return () => { isMounted = false; };
  }, [currentUser?.firstName]);

  // Live Data
  const contracts = useMemo(() => getContracts(), [refreshKey]);
  const invoices = useMemo(() => getInvoices(), [refreshKey]);
  const billboards = useMemo(() => getBillboards(), [refreshKey]);
  const clients = useMemo(() => getClients(), [refreshKey]);

  // Calculated metrics
  const metrics = useMemo(() => {
    const totalRevenue = invoices.filter(i => i.type === 'Invoice').reduce((acc, curr) => acc + curr.total, 0);
    const activeContracts = contracts.filter(c => c.status === 'Active').length;
    
    // Calculate active contracts with date validation
    const today = new Date();
    const activeContractsList = contracts.filter(c => 
      c.status === 'Active' && 
      new Date(c.startDate) <= today && 
      new Date(c.endDate) >= today
    );
    
    // LED billboards - calculate from active contracts, not from rentedSlots field
    const ledBillboards = billboards.filter(b => b.type === BillboardType.LED);
    const totalLedSlots = ledBillboards.reduce((acc, b) => acc + (b.totalSlots || 0), 0);
    // Count LED slots rented based on active contracts for this billboard
    const rentedLedSlots = ledBillboards.reduce((acc, b) => {
      const ledContracts = activeContractsList.filter(c => c.billboardId === b.id);
      return acc + ledContracts.length;
    }, 0);
    const digitalOccupancyRate = totalLedSlots > 0 ? Math.round((rentedLedSlots / totalLedSlots) * 100) : 0;
    
    const staticBillboards = billboards.filter(b => b.type === BillboardType.Static);
    // Each static billboard has 2 sides (Side A and Side B)
    const totalStaticSides = staticBillboards.length * 2;
    
    // Calculate rented static sides based on ACTIVE contracts (not just status fields)
    const rentedStaticSides = staticBillboards.reduce((acc, b) => {
      let count = 0;
      // Check if there's an active contract for each side
      const sideABooked = activeContractsList.some(c => c.billboardId === b.id && (c.side === 'A' || c.side === 'Both'));
      const sideBBooked = activeContractsList.some(c => c.billboardId === b.id && (c.side === 'B' || c.side === 'Both'));
      if (sideABooked) count++;
      if (sideBBooked) count++;
      return acc + count;
    }, 0);
    const staticOccupancyRate = totalStaticSides > 0 ? Math.round((rentedStaticSides / totalStaticSides) * 100) : 0;
    const occupancyRate = Math.round(((rentedLedSlots + rentedStaticSides) / (totalLedSlots + totalStaticSides)) * 100) || 0;

    const occupancyData = [
      { name: 'Occupied', value: rentedLedSlots + rentedStaticSides },
      { name: 'Available', value: (totalLedSlots + totalStaticSides) - (rentedLedSlots + rentedStaticSides) },
    ];
    const digitalOccupancyData = [
      { name: 'Occupied', value: rentedLedSlots },
      { name: 'Available', value: totalLedSlots - rentedLedSlots },
    ];
    const staticOccupancyData = [
      { name: 'Occupied', value: rentedStaticSides },
      { name: 'Available', value: totalStaticSides - rentedStaticSides },
    ];

    const topClientsData = clients
      .map(client => {
        const clientRevenue = invoices.filter(i => i.clientId === client.id && i.type === 'Invoice').reduce((acc, curr) => acc + curr.total, 0);
        return { name: client.companyName, value: clientRevenue };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const revenueByTownData = billboards
      .reduce((acc: any[], curr) => {
        const billboardContracts = contracts.filter(c => c.billboardId === curr.id && c.status === 'Active');
        const revenue = billboardContracts.reduce((sum, c) => sum + c.totalContractValue, 0);
        const existing = acc.find(item => item.name === curr.town);
        if (existing) existing.value += revenue;
        else acc.push({ name: curr.town, value: revenue });
        return acc;
      }, [])
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 5);

    return {
      totalRevenue, activeContracts, clients: clients.length,
      ledBillboards: ledBillboards.length, staticBillboards: staticBillboards.length,
      totalLedSlots, rentedLedSlots, digitalOccupancyRate,
      totalStaticSides, rentedStaticSides, staticOccupancyRate, occupancyRate,
      occupancyData, digitalOccupancyData, staticOccupancyData,
      topClientsData, revenueByTownData
    };
  }, [contracts, invoices, billboards, clients]);

  // Notification data
  const { expiringContracts, overdueInvoices, upcomingBillings } = useMemo(() => ({
    expiringContracts: getExpiringContracts(),
    overdueInvoices: getOverdueInvoices(),
    upcomingBillings: getUpcomingBillings().slice(0, 3)
  }), [refreshKey]);
  
  const financialTrends = useMemo(() => getFinancialTrends(), [refreshKey]);

  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown', [clients]);

  // Colors
  const COLORS = { indigo: '#6366f1', blue: '#3b82f6', emerald: '#10b981', amber: '#f59e0b', red: '#ef4444', slate: '#64748b' };

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting || 'Welcome back'}</h1>
          <p className="text-slate-500 mt-1">Here's what's happening with your billboard business today.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={`$${metrics.totalRevenue.toLocaleString()}`}
          change="+12%"
          trend="up"
          icon={DollarSign}
          color="indigo"
        />
        <KPICard
          title="Active Contracts"
          value={metrics.activeContracts.toString()}
          subtitle={`${metrics.clients} clients`}
          icon={FileText}
          color="emerald"
        />
        <KPICard
          title="Occupancy Rate"
          value={`${metrics.occupancyRate}%`}
          subtitle={`${metrics.rentedLedSlots + metrics.rentedStaticSides} / ${metrics.totalLedSlots + metrics.totalStaticSides} slots`}
          icon={Activity}
          color="blue"
        />
        <KPICard
          title="Billboards"
          value={(metrics.ledBillboards + metrics.staticBillboards).toString()}
          subtitle={`${metrics.ledBillboards} LED • ${metrics.staticBillboards} Static`}
          icon={Building2}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Financial Chart */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Financial Performance</h3>
                <p className="text-sm text-slate-500">Revenue vs Expenses over time</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-800"></span> Revenue</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Margin</span>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financialTrends}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#1e293b" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                  />
                  <Bar dataKey="revenue" barSize={24} fill="url(#revenueGradient)" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="margin" stroke="#6366f1" strokeWidth={2} dot={{r: 3, fill: '#6366f1'}} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Occupancy & Location Grid */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Occupancy Overview */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Occupancy Overview</h3>
              <div className="grid grid-cols-3 gap-4">
                <OccupancyRing 
                  title="Overall" 
                  percentage={metrics.occupancyRate} 
                  color={COLORS.indigo}
                  subtitle={`${metrics.rentedLedSlots + metrics.rentedStaticSides} / ${metrics.totalLedSlots + metrics.totalStaticSides}`}
                />
                <OccupancyRing 
                  title="LED Digital" 
                  percentage={metrics.digitalOccupancyRate} 
                  color={COLORS.blue}
                  subtitle={`${metrics.rentedLedSlots} / ${metrics.totalLedSlots}`}
                  bgColor="bg-blue-50"
                />
                <OccupancyRing 
                  title="Static" 
                  percentage={metrics.staticOccupancyRate} 
                  color={COLORS.emerald}
                  subtitle={`${metrics.rentedStaticSides} / ${metrics.totalStaticSides}`}
                  bgColor="bg-emerald-50"
                />
              </div>
            </div>

            {/* Top Locations */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Revenue by Location</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.revenueByTownData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} width={80} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                      {metrics.revenueByTownData.map((_, i) => (
                        <Cell key={i} fill={['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Clients */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Top Clients by Revenue</h3>
            <div className="space-y-3">
              {metrics.topClientsData.map((client, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </div>
                    <span className="font-medium text-slate-900">{client.name}</span>
                  </div>
                  <span className="font-bold text-slate-900">${client.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Action Required */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={18} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900">Action Required</h3>
            </div>
            
            {/* Upcoming Collections */}
            {upcomingBillings.length > 0 && (
              <div className="mb-4 pb-4 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Upcoming Collections</h4>
                <div className="space-y-2">
                  {upcomingBillings.map((bill, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-indigo-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{bill.clientName}</p>
                        <p className="text-xs text-slate-500">Due {bill.date}</p>
                      </div>
                      <span className="text-sm font-bold text-indigo-600">${bill.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts */}
            {expiringContracts.length === 0 && overdueInvoices.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl">
                <Sparkles size={24} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {expiringContracts.map(c => (
                  <div key={c.id} className="p-3 bg-amber-50 rounded-xl flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Contract Expiring</p>
                      <p className="text-xs text-slate-500">{getClientName(c.clientId)} • {c.endDate}</p>
                    </div>
                  </div>
                ))}
                {overdueInvoices.slice(0, 3).map(inv => (
                  <div key={inv.id} className="p-3 bg-red-50 rounded-xl flex items-start gap-3">
                    <AlertTriangle size={16} className="text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Overdue Payment</p>
                      <p className="text-xs text-slate-500">{getClientName(inv.clientId)} • ${inv.total.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Industry News */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper size={18} className="text-indigo-600" />
                <h3 className="font-bold text-slate-900">Industry News</h3>
              </div>
              {news.length > 0 && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{news.length} stories</span>
              )}
            </div>
            <div className="space-y-3">
              {news.length > 0 ? news.map((item, idx) => {
                const catColors: Record<string, string> = {
                  'Promo Launch': 'bg-emerald-50 text-emerald-700',
                  'Industry': 'bg-indigo-50 text-indigo-700',
                  'Regulation': 'bg-amber-50 text-amber-700',
                  'Technology': 'bg-blue-50 text-blue-700',
                };
                const catStyle = catColors[(item as any).category] || 'bg-slate-100 text-slate-600';
                return (
                  <div key={idx} className="cursor-pointer group p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100" onClick={() => setSelectedNews(item)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${catStyle}`}>{(item as any).category || item.source || 'News'}</span>
                      <span className="text-[10px] text-slate-400">{item.date}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">{item.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{item.summary}</p>
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
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const catColors: Record<string, string> = {
                    'Promo Launch': 'bg-emerald-50 text-emerald-700',
                    'Industry': 'bg-indigo-50 text-indigo-700',
                    'Regulation': 'bg-amber-50 text-amber-700',
                    'Technology': 'bg-blue-50 text-blue-700',
                  };
                  const catStyle = catColors[(selectedNews as any).category] || 'bg-slate-100 text-slate-600';
                  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${catStyle}`}>{(selectedNews as any).category || selectedNews.source || 'News'}</span>;
                })()}
                <span className="text-[10px] font-medium text-slate-400">{selectedNews.source}</span>
                {selectedNews.date && <span className="text-[10px] text-slate-400">&bull; {selectedNews.date}</span>}
              </div>
              <button onClick={() => setSelectedNews(null)} className="shrink-0 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            {/* Scrollable body */}
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

// Component: KPI Card
const KPICard: React.FC<{
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  subtitle?: string;
  icon: any;
  color: 'indigo' | 'emerald' | 'blue' | 'amber';
}> = ({ title, value, change, trend, subtitle, icon: Icon, color }) => {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${colors[color]}`}>
          <Icon size={20} />
        </div>
        {change && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
};

// Component: Occupancy Ring
const OccupancyRing: React.FC<{
  title: string;
  percentage: number;
  color: string;
  subtitle: string;
  bgColor?: string;
}> = ({ title, percentage, color, subtitle, bgColor = 'bg-slate-50' }) => {
  return (
    <div className={`${bgColor} rounded-2xl p-4 text-center`}>
      <p className="text-xs font-bold text-slate-600 mb-2">{title}</p>
      <div className="relative w-16 h-16 mx-auto">
        <svg className="w-16 h-16 transform -rotate-90">
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white" />
          <circle cx="32" cy="32" r="28" stroke={color} strokeWidth="4" fill="transparent" 
            strokeDasharray={`${percentage * 1.76} 176`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-black" style={{ color }}>{percentage}%</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-1 font-medium">{subtitle}</p>
    </div>
  );
};
