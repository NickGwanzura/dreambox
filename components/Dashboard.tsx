
import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, ComposedChart, Line
} from 'recharts';
import { DollarSign, FileText, Activity, Users, Sparkles, TrendingUp, Bell, AlertTriangle, Calendar, ArrowRight, BrainCircuit, Newspaper, X } from 'lucide-react';
import { getContracts, getInvoices, getBillboards, getClients, getExpiringContracts, getOverdueInvoices, getUpcomingBillings, getFinancialTrends, subscribe } from '../services/mockData';
import { BillboardType } from '../types';
import { analyzeBusinessData, generateGreeting, fetchIndustryNews } from '../services/aiService';
import { getCurrentUser } from '../services/authService';

export const Dashboard: React.FC = () => {
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [news, setNews] = useState<Array<{ title: string; summary: string; source?: string; date?: string }>>([]);
  const [selectedNews, setSelectedNews] = useState<{ title: string; summary: string; source?: string; date?: string } | null>(null);
  
  // State for live updates
  const [refreshKey, setRefreshKey] = useState(0);

  const currentUser = getCurrentUser();

  // Real-time subscription
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          setRefreshKey(prev => prev + 1);
      });
      return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
      const fetchGreeting = async () => {
          if (currentUser?.firstName) {
              const greet = await generateGreeting(currentUser.firstName);
              setGreeting(greet);
          }
      };
      
      const loadNews = async () => {
          const newsItems = await fetchIndustryNews();
          setNews(newsItems);
      };

      fetchGreeting();
      loadNews();
  }, []);

  // Live Data (re-fetched on refreshKey change)
  const contracts = getContracts();
  const invoices = getInvoices();
  const billboards = getBillboards();
  const clients = getClients();

  // Notification Data
  const expiringContracts = getExpiringContracts();
  const overdueInvoices = getOverdueInvoices();
  const upcomingBillings = getUpcomingBillings().slice(0, 3);
  const financialTrends = getFinancialTrends();

  const totalRevenue = invoices.filter(i => i.type === 'Invoice').reduce((acc, curr) => acc + curr.total, 0);
  const activeContracts = contracts.filter(c => c.status === 'Active').length;
  
  const ledBillboards = billboards.filter(b => b.type === BillboardType.LED);
  const totalLedSlots = ledBillboards.reduce((acc, b) => acc + (b.totalSlots || 0), 0);
  const rentedLedSlots = ledBillboards.reduce((acc, b) => acc + (b.rentedSlots || 0), 0);
  
  const staticBillboards = billboards.filter(b => b.type === BillboardType.Static);
  const totalStaticSides = staticBillboards.length * 2;
  const rentedStaticSides = staticBillboards.reduce((acc, b) => {
    let count = 0;
    if (b.sideAStatus === 'Rented') count++;
    if (b.sideBStatus === 'Rented') count++;
    return acc + count;
  }, 0);

  const occupancyRate = Math.round(((rentedLedSlots + rentedStaticSides) / (totalLedSlots + totalStaticSides)) * 100) || 0;

  const occupancyData = [
    { name: 'Occupied', value: rentedLedSlots + rentedStaticSides },
    { name: 'Available', value: (totalLedSlots + totalStaticSides) - (rentedLedSlots + rentedStaticSides) },
  ];
  const OCCUPANCY_COLORS = ['#6366f1', '#e2e8f0']; // Indigo-500, Slate-200

  const topClientsData = clients.map(client => {
      const clientRevenue = invoices
        .filter(i => i.clientId === client.id && i.type === 'Invoice')
        .reduce((acc, curr) => acc + curr.total, 0);
      return { name: client.companyName, value: clientRevenue };
  }).sort((a, b) => b.value - a.value).slice(0, 5);

  const revenueByTownData = billboards.reduce((acc: any[], curr) => {
      const billboardContracts = contracts.filter(c => c.billboardId === curr.id && c.status === 'Active');
      const revenue = billboardContracts.reduce((sum, c) => sum + c.totalContractValue, 0);
      const existing = acc.find(item => item.name === curr.town);
      if (existing) { existing.value += revenue; } else { acc.push({ name: curr.town, value: revenue }); }
      return acc;
  }, []).sort((a: any, b: any) => b.value - a.value).slice(0, 5);

  const handleAskAI = async (e?: React.FormEvent) => {
      if(e) e.preventDefault();
      if(!aiQuery) return;
      setLoadingAi(true);
      const context = `Revenue: $${totalRevenue}. Occupancy: ${occupancyRate}%. Active Contracts: ${activeContracts}. Expiring (30d): ${expiringContracts.length}. Overdue: ${overdueInvoices.length}. Top Client: ${topClientsData[0]?.name}. User Q: ${aiQuery}`;
      const result = await analyzeBusinessData(context);
      setAiResponse(result);
      setLoadingAi(false);
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown';

  return (
    <div className="space-y-8 animate-fade-in pb-12 flex flex-col xl:flex-row gap-8 relative">
      {/* Main Content Area */}
      <div className="flex-1 space-y-8 min-w-0">
        
        {/* AI Analyst Section - Dreambox Gradient (Indigo/Violet) */}
        <div className="bg-gradient-to-br from-slate-900 via-[#1e1b4b] to-indigo-950 rounded-3xl p-8 text-white shadow-2xl shadow-indigo-900/20 relative overflow-hidden group border border-slate-700/50">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 group-hover:bg-indigo-600/20 transition-all duration-1000"></div>
            
            <div className="relative z-10">
                {greeting && (
                    <div className="mb-4 text-indigo-300 font-medium text-sm uppercase tracking-wider flex items-center gap-2">
                        <Sparkles size={14} className="text-indigo-400" /> {greeting}
                    </div>
                )}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shadow-inner"><BrainCircuit size={24} className="text-indigo-400"/></div>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Dreambox AI</h2>
                        <p className="text-slate-400 text-sm">Strategic intelligence for your fleet</p>
                    </div>
                </div>
                
                <form onSubmit={handleAskAI} className="relative max-w-2xl mb-6">
                    <input 
                        type="text" 
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        placeholder="Ask about revenue trends, occupancy, or strategy..." 
                        className="w-full pl-6 pr-14 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-slate-500 backdrop-blur-md focus:outline-none focus:bg-white/10 focus:border-indigo-500/50 transition-all shadow-lg shadow-black/10"
                    />
                    <button type="submit" disabled={loadingAi} className="absolute right-2 top-2 p-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed active:scale-95">
                        {loadingAi ? <Sparkles size={20} className="animate-spin"/> : <ArrowRight size={20} />}
                    </button>
                </form>

                {aiResponse && (
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md animate-fade-in shadow-inner">
                        <div className="flex items-start gap-3">
                            <Sparkles size={18} className="text-indigo-400 mt-1 shrink-0 animate-pulse"/>
                            <p className="text-sm leading-relaxed text-slate-100 font-medium">{aiResponse}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-slate-100 rounded-2xl shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all text-slate-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-green-50 text-green-700 rounded-full flex items-center gap-1 border border-green-100">
                <TrendingUp size={12}/> +12%
              </span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Total Revenue</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">${totalRevenue.toLocaleString()}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-50 rounded-2xl shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all text-indigo-600">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">Active</span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Contracts</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{activeContracts}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-slate-100 rounded-2xl shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all text-slate-600">
                <Activity className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                {rentedLedSlots + rentedStaticSides} / {totalLedSlots + totalStaticSides}
              </span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Occupancy</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{occupancyRate}%</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-slate-100 rounded-2xl shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all text-slate-600">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-green-50 text-green-700 rounded-full flex items-center gap-1 border border-green-100">
                <TrendingUp size={12}/> +2
              </span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Total Clients</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{clients.length}</h3>
            </div>
          </div>
        </div>

        {/* Main Charts Row */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">Financial Performance</h3>
                    <p className="text-sm text-slate-500 font-medium">Revenue vs Expenses (Actuals + Forecast)</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm text-slate-800"><span className="w-2.5 h-2.5 rounded-full bg-slate-900"></span> Revenue</div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Margin</div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Exp.</div>
                </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financialTrends}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#1e293b" stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `$${value/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px' }}
                    itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                    cursor={{fill: '#f1f5f9'}}
                  />
                  <Bar dataKey="revenue" barSize={28} fill="url(#revenueGradient)" radius={[6, 6, 0, 0]} name="Revenue" />
                  <Bar dataKey="expenses" barSize={28} fill="#e2e8f0" radius={[6, 6, 0, 0]} name="Expenses" />
                  <Line type="monotone" dataKey="margin" stroke="#6366f1" strokeWidth={3} dot={{r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff'}} name="Net Margin" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
        </div>
        
        {/* Secondary Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Revenue by Town */}
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Top Locations</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueByTownData} layout="vertical" margin={{ left: 0, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} width={100} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}/>
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                                {revenueByTownData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8'][index % 5]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Occupancy Donut */}
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Fleet Occupancy</h3>
                <div className="h-64 relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                        data={occupancyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={85}
                        outerRadius={105}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={8}
                        >
                        {occupancyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={OCCUPANCY_COLORS[index % OCCUPANCY_COLORS.length]} />
                        ))}
                        </Pie>
                    </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                        <span className="text-5xl font-black text-slate-900 tracking-tighter">{occupancyRate}%</span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Occupied</span>
                    </div>
                </div>
             </div>
        </div>
      </div>

      {/* Sidebar Notifications */}
      <div className="w-full xl:w-96 space-y-6 min-w-0">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-2 mb-6 text-slate-800 font-bold uppercase tracking-wide text-xs">
                 <Bell size={16} className="text-indigo-500" /> Action Required
             </div>
             
             <div className="space-y-4">
                 {/* Upcoming Collections */}
                 {upcomingBillings.length > 0 && (
                     <div className="mb-6 pb-6 border-b border-slate-100">
                        <div className="flex items-center gap-2 mb-4">
                            <Calendar size={14} className="text-indigo-500" />
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Upcoming Collections</h4>
                        </div>
                        <div className="space-y-3">
                            {upcomingBillings.map((bill, i) => (
                                <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100/50 hover:bg-white hover:shadow-md transition-all">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 truncate">{bill.clientName}</p>
                                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Due: {bill.date}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">${bill.amount.toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                 )}

                 {/* Alerts List */}
                 {expiringContracts.length === 0 && overdueInvoices.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600"><Sparkles size={20}/></div>
                        <p className="text-sm font-medium text-slate-500">All caught up!</p>
                        <p className="text-xs text-slate-400">No pending alerts.</p>
                    </div>
                 ) : (
                    <>
                        {expiringContracts.map(c => (
                            <div key={c.id} className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                                <div className="p-2 bg-white rounded-xl text-amber-500 shadow-sm border border-amber-50 shrink-0">
                                    <Bell size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-0.5">Expiring Contract</h4>
                                    <p className="text-sm font-bold text-slate-800 truncate">{getClientName(c.clientId)}</p>
                                    <p className="text-xs text-slate-500 mt-1">Ends {c.endDate}</p>
                                </div>
                            </div>
                        ))}
                        {overdueInvoices.slice(0, 3).map(inv => (
                            <div key={inv.id} className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3">
                                <div className="p-2 bg-white rounded-xl text-red-500 shadow-sm border border-red-50 shrink-0">
                                    <AlertTriangle size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">Overdue Payment</h4>
                                    <p className="text-sm font-bold text-slate-800 truncate">{getClientName(inv.clientId)}</p>
                                    <p className="text-xs text-slate-500 mt-1">${inv.total.toLocaleString()} • #{inv.id}</p>
                                </div>
                            </div>
                        ))}
                    </>
                 )}
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-2 mb-6">
                 <Newspaper size={16} className="text-indigo-500" />
                 <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Zimbabwe News</h3>
             </div>
             <div className="space-y-4">
                 {news.length > 0 ? (
                     news.map((item, idx) => (
                         <div key={idx} className="group cursor-pointer" onClick={() => setSelectedNews(item)}>
                             <div className="flex justify-between items-start mb-1">
                                 <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{item.source || 'Industry'}</span>
                                 <span className="text-[9px] text-slate-400 font-mono">{item.date}</span>
                             </div>
                             <h4 className="text-sm font-bold text-slate-800 leading-tight mb-1 group-hover:text-indigo-600 transition-colors">{item.title}</h4>
                             <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{item.summary}</p>
                             {idx < news.length - 1 && <div className="border-b border-slate-50 mt-4"></div>}
                         </div>
                     ))
                 ) : (
                     <div className="text-center py-8 text-slate-400 text-xs italic">Loading latest updates...</div>
                 )}
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Revenue Sources</h3>
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientsData} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="value" fill="#1e293b" radius={[0, 6, 6, 0]} barSize={16}>
                        {topClientsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8'][index % 5]} />
                        ))}
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
             </div>
          </div>
      </div>

      {selectedNews && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in" onClick={() => setSelectedNews(null)}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                <div className="relative h-32 bg-slate-900 overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-violet-700 opacity-90"></div>
                     <div className="absolute inset-0 flex items-center justify-center">
                        <Newspaper size={48} className="text-white/20" />
                     </div>
                     <button onClick={() => setSelectedNews(null)} className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-colors backdrop-blur-sm"><X size={20}/></button>
                </div>
                <div className="p-8 -mt-6 relative z-10 bg-white rounded-t-3xl">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 uppercase tracking-wider">{selectedNews.source}</span>
                        <span className="text-xs text-slate-400 font-mono">{selectedNews.date}</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-6 leading-tight">{selectedNews.title}</h3>
                    <div className="prose prose-slate prose-sm text-slate-600 leading-relaxed">
                        {selectedNews.summary}
                    </div>
                    <div className="mt-8 pt-6 border-t border-slate-50 flex justify-end">
                        <button onClick={() => setSelectedNews(null)} className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-colors shadow-lg">Close Article</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};