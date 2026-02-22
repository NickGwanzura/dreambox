
import React, { useState } from 'react';
import { getExpenses, addExpense, printingJobs, getClients } from '../services/mockData';
import { generateExpensesPDF } from '../services/pdfGenerator';
import { Printer, TrendingDown, Plus, BarChart3, Scissors, Droplets, Zap, User, X, Save, Download } from 'lucide-react';
import { PrintingJob, Expense } from '../types';

const MinimalInput = ({ label, value, onChange, type = "text", placeholder }: any) => (
  <div className="group relative">
    <input type={type} value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" placeholder=" " />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

export const Expenses: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'General' | 'Printing' | 'Reports'>('General');
  const [generalExpenses, setGeneralExpenses] = useState<Expense[]>(getExpenses());
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [newJob, setNewJob] = useState<Partial<PrintingJob>>({ clientId: '', description: '', dimensions: '', pvcCost: 0, inkCost: 0, electricityCost: 0, operatorCost: 0, weldingCost: 0, chargedAmount: 0 });
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({ category: 'Maintenance', description: '', amount: 0, date: new Date().toISOString().split('T')[0], reference: '' });

  const getClientName = (id: string) => getClients().find(c => c.id === id)?.companyName || 'Unknown';
  const handleAddJob = (e: React.FormEvent) => { e.preventDefault(); setIsAddJobModalOpen(false); alert("Job Added! (Simulated)"); };
  const handleAddExpense = (e: React.FormEvent) => { e.preventDefault(); const expense: Expense = { id: `EXP-${Date.now()}`, category: newExpense.category as any, description: newExpense.description || '', amount: newExpense.amount || 0, date: newExpense.date || new Date().toISOString(), reference: newExpense.reference }; addExpense(expense); setGeneralExpenses(getExpenses()); setIsAddExpenseModalOpen(false); setNewExpense({ category: 'Maintenance', description: '', amount: 0, date: new Date().toISOString().split('T')[0], reference: '' }); };
  const exportExpenseReport = () => { const clients = getClients(); const csvRows = clients.map(client => { const jobs = printingJobs.filter(j => j.clientId === client.id); if (jobs.length === 0) return null; const totalSpent = jobs.reduce((acc, curr) => acc + curr.chargedAmount, 0); const totalCost = jobs.reduce((acc, curr) => acc + curr.totalCost, 0); const profit = totalSpent - totalCost; const margin = totalSpent > 0 ? ((profit / totalSpent) * 100).toFixed(2) : '0'; return `"${client.companyName}",${jobs.length},${totalSpent},${totalCost},${profit},${margin}`; }).filter(row => row !== null).join("\n"); if (!csvRows) { alert("No data to export."); return; } const blob = new Blob(["Client,Total Jobs,Total Billed,Total Internal Cost,Net Profit,Margin %\n" + csvRows], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `printing_expenses_report_${new Date().toISOString().slice(0,10)}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
  const calculateTotalJobCost = () => { return (newJob.pvcCost || 0) + (newJob.inkCost || 0) + (newJob.electricityCost || 0) + (newJob.operatorCost || 0) + (newJob.weldingCost || 0); };

  // Calculate dynamic totals from actual data
  const pvcTotal = printingJobs.reduce((acc, job) => acc + job.pvcCost, 0);
  const inkTotal = printingJobs.reduce((acc, job) => acc + job.inkCost, 0);
  const electricityTotal = printingJobs.reduce((acc, job) => acc + job.electricityCost, 0);
  const laborTotal = printingJobs.reduce((acc, job) => acc + job.operatorCost + job.weldingCost, 0);

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Expenses & Production</h2><p className="text-slate-500 font-medium">Internal cost tracking, printing jobs, and profitability analysis</p></div>
          <div className="flex gap-2">
              {activeTab === 'Printing' && (<button onClick={() => setIsAddJobModalOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"><Plus size={16} /> New Print Job</button>)}
              {activeTab === 'General' && (
                  <div className="flex gap-2">
                      <button onClick={() => generateExpensesPDF(generalExpenses)} className="bg-slate-100 text-slate-600 px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-2"><Download size={16} /> PDF Report</button>
                      <button onClick={() => setIsAddExpenseModalOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"><Plus size={16} /> New Expense</button>
                  </div>
              )}
              {activeTab === 'Reports' && (<button onClick={exportExpenseReport} className="bg-slate-100 text-slate-600 px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-2"><Download size={16} /> Export CSV</button>)}
          </div>
        </div>
        <div className="flex border-b border-slate-200 gap-8"><button onClick={() => setActiveTab('General')} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'General' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>General Expenses</button><button onClick={() => setActiveTab('Printing')} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'Printing' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Printing Module</button><button onClick={() => setActiveTab('Reports')} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'Reports' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Cost Reports</button></div>
        {activeTab === 'General' && (<div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden animate-fade-in"><div className="p-6 border-b border-slate-50"><h3 className="text-lg font-semibold text-slate-800">Operational Expenses</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[700px]"><thead className="bg-slate-50/50"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Category</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Description</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Reference</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{generalExpenses.map(exp => (<tr key={exp.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-mono text-xs">{exp.date}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${exp.category === 'Maintenance' ? 'bg-orange-50 text-orange-600' : exp.category === 'Electricity' ? 'bg-yellow-50 text-yellow-600' : 'bg-slate-100 text-slate-600'}`}>{exp.category}</span></td><td className="px-6 py-4 font-medium text-slate-900">{exp.description}</td><td className="px-6 py-4 text-xs font-mono text-slate-400">{exp.reference || '-'}</td><td className="px-6 py-4 text-right font-bold text-slate-900">${exp.amount.toLocaleString()}</td></tr>))}{generalExpenses.length === 0 && (<tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No expenses recorded yet.</td></tr>)}</tbody></table></div></div>)}
        {activeTab === 'Printing' && (<div className="space-y-6 animate-fade-in"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><Scissors size={14} /> PVC Costs</div><h3 className="text-2xl font-bold text-slate-800">${pvcTotal.toLocaleString()}</h3></div><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><Droplets size={14} /> Ink Costs</div><h3 className="text-2xl font-bold text-slate-800">${inkTotal.toLocaleString()}</h3></div><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><Zap size={14} /> Electricity</div><h3 className="text-2xl font-bold text-slate-800">${electricityTotal.toLocaleString()}</h3></div><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><User size={14} /> Operator Labor</div><h3 className="text-2xl font-bold text-slate-800">${laborTotal.toLocaleString()}</h3></div></div><div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden"><div className="p-6 border-b border-slate-50"><h3 className="text-lg font-semibold text-slate-800">Recent Printing Jobs</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[700px]"><thead className="bg-slate-50/50"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Job Details</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Cost</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Charged</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Profit</th></tr></thead><tbody className="divide-y divide-slate-100">{printingJobs.map(job => { const profit = job.chargedAmount - job.totalCost; return (<tr key={job.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4">{job.date}</td><td className="px-6 py-4 font-medium text-slate-900">{getClientName(job.clientId)}</td><td className="px-6 py-4"><p className="font-medium text-slate-800">{job.description}</p><p className="text-xs text-slate-500">{job.dimensions}</p></td><td className="px-6 py-4 text-right">${job.totalCost}</td><td className="px-6 py-4 text-right">${job.chargedAmount}</td><td className={`px-6 py-4 text-right font-bold ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>${profit}</td></tr>) })}</tbody></table></div></div></div>)}
        {activeTab === 'Reports' && (<div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 animate-fade-in"><h3 className="text-xl font-bold text-slate-800 mb-6">Client Printing Spend Report</h3><div className="space-y-4">{getClients().map(client => { const jobs = printingJobs.filter(j => j.clientId === client.id); const totalSpent = jobs.reduce((acc, curr) => acc + curr.chargedAmount, 0); const totalCost = jobs.reduce((acc, curr) => acc + curr.totalCost, 0); if(totalSpent === 0) return null; return (<div key={client.id} className="border border-slate-100 rounded-xl p-6 hover:shadow-md transition-all"><div className="flex justify-between items-center mb-4"><h4 className="font-bold text-slate-900 text-lg">{client.companyName}</h4><span className="text-sm font-medium text-slate-500">{jobs.length} Jobs</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-slate-400 font-bold uppercase">Total Billed</p><p className="text-xl font-bold text-slate-900">${totalSpent}</p></div><div><p className="text-xs text-slate-400 font-bold uppercase">Our Cost</p><p className="text-xl font-bold text-slate-700">${totalCost}</p></div><div className="md:col-span-2"><p className="text-xs text-slate-400 font-bold uppercase mb-1">Margin Analysis</p><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${((totalSpent - totalCost) / totalSpent) * 100}%` }}></div></div></div></div></div>) })}</div></div>)}
      </div>
      {/* ... Add Job Modal & Expense Modal code remains the same ... */}
      {isAddJobModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsAddJobModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl border border-white/20">
                    <div className="p-6 border-b border-slate-100 sticky top-0 z-10 bg-white"><h3 className="text-xl font-bold text-slate-900">New Printing Job</h3></div>
                    <form onSubmit={handleAddJob} className="p-8 space-y-8">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="col-span-2"><label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Client</label><select className="w-full px-0 py-2 border-b border-slate-200 bg-transparent text-slate-800 font-medium focus:border-slate-800 outline-none" value={newJob.clientId} onChange={(e) => setNewJob({...newJob, clientId: e.target.value})}><option value="">Select Client</option>{getClients().map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select></div>
                            <div className="col-span-2"><MinimalInput label="Description / Ref" value={newJob.description} onChange={(e: any) => setNewJob({...newJob, description: e.target.value})} /></div>
                            <MinimalInput label="Dimensions (e.g. 12x4m)" value={newJob.dimensions} onChange={(e: any) => setNewJob({...newJob, dimensions: e.target.value})} />
                            <MinimalInput label="Billed Amount ($)" type="number" value={newJob.chargedAmount} onChange={(e: any) => setNewJob({...newJob, chargedAmount: Number(e.target.value)})} />
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Internal Cost Breakdown</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <MinimalInput label="PVC Cost" type="number" value={newJob.pvcCost} onChange={(e: any) => setNewJob({...newJob, pvcCost: Number(e.target.value)})} />
                                <MinimalInput label="Ink" type="number" value={newJob.inkCost} onChange={(e: any) => setNewJob({...newJob, inkCost: Number(e.target.value)})} />
                                <MinimalInput label="Electricity" type="number" value={newJob.electricityCost} onChange={(e: any) => setNewJob({...newJob, electricityCost: Number(e.target.value)})} />
                                <MinimalInput label="Operator" type="number" value={newJob.operatorCost} onChange={(e: any) => setNewJob({...newJob, operatorCost: Number(e.target.value)})} />
                                <MinimalInput label="Welding" type="number" value={newJob.weldingCost} onChange={(e: any) => setNewJob({...newJob, weldingCost: Number(e.target.value)})} />
                                <div className="flex flex-col justify-end"><p className="text-xs text-slate-400">Total Cost</p><p className="text-lg font-bold text-slate-800">${calculateTotalJobCost()}</p></div>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => setIsAddJobModalOpen(false)} className="flex-1 py-3 text-slate-500 hover:bg-slate-50 rounded-xl font-medium">Cancel</button>
                            <button type="submit" className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-wider shadow-lg">Save Job</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsAddExpenseModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Record Operational Expense</h3>
                        <button onClick={() => setIsAddExpenseModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleAddExpense} className="p-8 space-y-6">
                        <MinimalSelect label="Category" value={newExpense.category} onChange={(e: any) => setNewExpense({...newExpense, category: e.target.value})} options={[{value: 'Maintenance', label: 'Maintenance & Repairs'},{value: 'Electricity', label: 'Electricity / Power'},{value: 'Labor', label: 'General Labor'},{value: 'Printing', label: 'Printing Supplies (Misc)'},{value: 'Other', label: 'Other'}]} />
                        <MinimalInput label="Description" value={newExpense.description} onChange={(e: any) => setNewExpense({...newExpense, description: e.target.value})} required />
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Amount ($)" type="number" value={newExpense.amount} onChange={(e: any) => setNewExpense({...newExpense, amount: Number(e.target.value)})} required />
                            <MinimalInput label="Date" type="date" value={newExpense.date} onChange={(e: any) => setNewExpense({...newExpense, date: e.target.value})} />
                        </div>
                        <MinimalInput label="Reference / Invoice No." value={newExpense.reference} onChange={(e: any) => setNewExpense({...newExpense, reference: e.target.value})} />
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Save size={18} /> Record Expense</button>
                    </form>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
