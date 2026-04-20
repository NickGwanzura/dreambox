import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { getBillboards, getMaintenanceLogs, addMaintenanceLog, addExpense, getExpenses } from '../services/mockData';
import { Billboard, MaintenanceLog, Expense } from '../types';
import { Wrench, Calendar, CheckCircle, AlertTriangle, Clock, Plus, X, Save, Search, MapPin, History, Hammer, FileText, DollarSign, ChevronRight } from 'lucide-react';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative pt-5">
    <input 
        type={type} 
        required={required} 
        value={value} 
        onChange={onChange} 
        placeholder=" " 
        className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" 
    />
    <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">
        {label}
    </label>
  </div>
);

// Fixed Select to always have label at top to prevent overlap with selected value
const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative pt-5">
    <select 
        value={value} 
        onChange={onChange} 
        className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer"
    >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium uppercase tracking-wide">
        {label}
    </label>
  </div>
);

export const Maintenance: React.FC = () => {
  const [billboards, setBillboards] = useState<Billboard[]>(getBillboards());
  const [logs, setLogs] = useState<MaintenanceLog[]>(getMaintenanceLogs());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBillboardId, setSelectedBillboardId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'Schedule' | 'History'>('Schedule');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [newLog, setNewLog] = useState<Partial<MaintenanceLog>>({
    date: new Date().toISOString().split('T')[0],
    type: 'Routine',
    description: '',
    cost: 0,
    performedBy: '',
    notes: ''
  });
  const [createExpense, setCreateExpense] = useState(false);

  useEffect(() => {
      setBillboards(getBillboards());
      setLogs(getMaintenanceLogs());
  }, [isModalOpen, viewMode]);

  const handleOpenModal = (billboardId?: string) => {
      if(billboardId) setSelectedBillboardId(billboardId);
      setNewLog({
        date: new Date().toISOString().split('T')[0],
        type: 'Routine',
        description: '',
        cost: 0,
        performedBy: '',
        notes: ''
      });
      setCreateExpense(false);
      setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedBillboardId) { alert("Please select a billboard."); return; }

      // Calculate next due date (3 months from completed date)
      const completedDate = new Date(newLog.date!);
      const nextDue = new Date(completedDate);
      nextDue.setMonth(nextDue.getMonth() + 3);

      const logEntry: MaintenanceLog = {
          id: `MAINT-${Date.now()}`,
          billboardId: selectedBillboardId,
          date: newLog.date!,
          type: newLog.type as any,
          description: newLog.description || 'Routine check',
          cost: Number(newLog.cost) || 0,
          performedBy: newLog.performedBy || 'Staff',
          nextDueDate: nextDue.toISOString().split('T')[0],
          notes: newLog.notes
      };

      addMaintenanceLog(logEntry);

      if (createExpense && logEntry.cost > 0) {
          const expense: Expense = {
              id: `EXP-${Date.now()}`,
              category: 'Maintenance',
              description: `Maintenance: ${logEntry.description} (${billboards.find(b => b.id === selectedBillboardId)?.name})`,
              amount: logEntry.cost,
              date: logEntry.date,
              reference: logEntry.id
          };
          addExpense(expense);
      }

      setIsModalOpen(false);
      // Refresh local state will happen via effect or manual set
      setBillboards(getBillboards());
      setLogs(getMaintenanceLogs());
  };

  const getStatus = (billboard: Billboard) => {
      if (!billboard.lastMaintenanceDate) return 'Overdue';
      
      const lastDate = new Date(billboard.lastMaintenanceDate);
      const nextDue = new Date(lastDate);
      nextDue.setMonth(nextDue.getMonth() + 3);
      
      const today = new Date();
      const warningDate = new Date(nextDue);
      warningDate.setDate(warningDate.getDate() - 14); // Warn 2 weeks ahead

      if (today > nextDue) return 'Overdue';
      if (today >= warningDate) return 'Due Soon';
      return 'Good';
  };

  const getNextDueDate = (lastDate?: string) => {
      if(!lastDate) return 'Immediately';
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + 3);
      return d.toLocaleDateString();
  };

  const filteredBillboards = billboards.filter(b => 
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      b.location.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
      // Sort by status urgency
      const statusA = getStatus(a);
      const statusB = getStatus(b);
      const score = { 'Overdue': 0, 'Due Soon': 1, 'Good': 2 };
      return score[statusA as keyof typeof score] - score[statusB as keyof typeof score];
  });

  const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown Asset';

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Maintenance Schedule</h2>
          <p className="text-slate-500 font-medium">Track asset health and 3-month service cycles</p>
        </div>
        <div className="flex gap-3 items-center w-full sm:w-auto">
            <div className="flex bg-slate-100 rounded-full p-1 border border-slate-200">
                <button onClick={() => setViewMode('Schedule')} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'Schedule' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Schedule</button>
                <button onClick={() => setViewMode('History')} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'History' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>History Log</button>
            </div>
            <button onClick={() => handleOpenModal()} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2">
                <Plus size={18} /> <span className="hidden sm:inline">Log Maintenance</span><span className="sm:hidden">Log</span>
            </button>
        </div>
      </div>

      {viewMode === 'Schedule' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <Calendar size={16} /> Asset Status Overview
                  </div>
                  <div className="relative group w-64">
                      <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                      <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search assets..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:border-slate-800 outline-none transition-all"/>
                  </div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
                      <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                              <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Billboard</th>
                              <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Location</th>
                              <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Last Service</th>
                              <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Next Due</th>
                              <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-center">Status</th>
                              <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Action</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredBillboards.map(b => {
                              const status = getStatus(b);
                              return (
                                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-6 py-4 font-bold text-slate-900">{b.name}</td>
                                      <td className="px-6 py-4 flex items-center gap-1"><MapPin size={14} className="text-slate-400"/> {b.location}, {b.town}</td>
                                      <td className="px-6 py-4 font-mono text-xs">{b.lastMaintenanceDate || 'Never'}</td>
                                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{getNextDueDate(b.lastMaintenanceDate)}</td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${status === 'Good' ? 'bg-green-50 text-green-600 border-green-100' : status === 'Due Soon' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                              {status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                          <button onClick={() => handleOpenModal(b.id)} className="text-indigo-600 hover:text-indigo-800 font-bold text-xs uppercase tracking-wider hover:underline">
                                              Log Service
                                          </button>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {viewMode === 'History' && (
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => (
                      <div key={log.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                          <div className="flex justify-between items-start mb-4">
                              <div className={`p-3 rounded-xl ${log.type === 'Repair' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                  {log.type === 'Repair' ? <Hammer size={20} /> : <CheckCircle size={20} />}
                              </div>
                              <span className="text-xs font-mono text-slate-400">{log.date}</span>
                          </div>
                          <h4 className="font-bold text-slate-900 mb-1">{getBillboardName(log.billboardId)}</h4>
                          <p className="text-sm text-slate-500 mb-2 line-clamp-2">{log.description}</p>
                          {log.notes && (
                              <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mb-4">
                                  <p className="text-xs text-slate-500 italic flex items-start gap-1">
                                      <FileText size={12} className="mt-0.5 shrink-0"/> {log.notes}
                                  </p>
                              </div>
                          )}
                          <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-slate-400 border-t border-slate-50 pt-4">
                              <span>By: {log.performedBy}</span>
                              {log.cost > 0 && <span className="text-slate-700">Cost: ${log.cost.toLocaleString()}</span>}
                          </div>
                      </div>
                  ))}
                  {logs.length === 0 && (
                      <div className="col-span-full py-12 text-center text-slate-400 italic bg-white rounded-2xl border border-slate-100 border-dashed">
                          No maintenance history records found.
                      </div>
                  )}
              </div>
          </div>
      )}

      {isModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                {/* Sticky header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900" id="modal-title">Record Maintenance</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {selectedBillboardId
                                ? <span>Asset: <span className="font-semibold text-slate-600">{getBillboardName(selectedBillboardId)}</span></span>
                                : 'Log a service event and update the 3-month schedule'}
                        </p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-8 space-y-6">
                    {/* Asset selector / context card */}
                    {!selectedBillboardId ? (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Select Asset</p>
                            <MinimalSelect
                                label="Billboard / Asset"
                                value={selectedBillboardId}
                                onChange={(e: any) => setSelectedBillboardId(e.target.value)}
                                options={[{value: '', label: 'Select Asset...'}, ...billboards.map(b => ({value: b.id, label: b.name}))]}
                            />
                            <p className="text-[10px] text-slate-400 mt-2">Choose the billboard this maintenance event applies to. This updates its service schedule.</p>
                        </div>
                    ) : (
                        <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center gap-4">
                            <div className="p-3 bg-slate-700 rounded-xl shrink-0">
                                <MapPin className="text-slate-300" size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Selected Asset</p>
                                <p className="font-bold text-white">{getBillboardName(selectedBillboardId)}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {billboards.find(b => b.id === selectedBillboardId)?.location}, {billboards.find(b => b.id === selectedBillboardId)?.town}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedBillboardId('')}
                                className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 shrink-0"
                            >
                                Change <ChevronRight size={12} />
                            </button>
                        </div>
                    )}

                    {/* Service record */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Service Record</p>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <MinimalInput
                                    label="Date Completed"
                                    type="date"
                                    value={newLog.date}
                                    onChange={(e: any) => setNewLog({...newLog, date: e.target.value})}
                                    required
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5">Next service due 3 months from this date.</p>
                            </div>
                            <div>
                                <MinimalSelect
                                    label="Service Type"
                                    value={newLog.type}
                                    onChange={(e: any) => setNewLog({...newLog, type: e.target.value})}
                                    options={[
                                        {value: 'Routine', label: 'Routine Check'},
                                        {value: 'Repair', label: 'Repair / Fix'},
                                        {value: 'Inspection', label: 'Inspection'},
                                        {value: 'Emergency', label: 'Emergency'}
                                    ]}
                                />
                                {newLog.type === 'Emergency' && (
                                    <p className="text-[10px] text-red-500 mt-1.5 font-medium">Emergency logs are flagged for management review.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <MinimalInput
                            label="Description / Summary"
                            value={newLog.description}
                            onChange={(e: any) => setNewLog({...newLog, description: e.target.value})}
                            required
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5">Briefly describe what was done — e.g. "Replaced torn vinyl, re-tensioned cables."</p>
                    </div>

                    {/* Notes */}
                    <div className="group relative pt-5">
                        <textarea
                            value={newLog.notes}
                            onChange={(e: any) => setNewLog({...newLog, notes: e.target.value})}
                            placeholder=" "
                            className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent resize-none h-20"
                        />
                        <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">
                            Internal Notes (Optional)
                        </label>
                    </div>

                    {/* Cost & Technician */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Cost & Technician</p>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <MinimalInput
                                    label="Cost ($)"
                                    type="number"
                                    value={newLog.cost}
                                    onChange={(e: any) => setNewLog({...newLog, cost: Number(e.target.value)})}
                                />
                                <p className="text-[10px] text-slate-400 mt-1.5">Enter 0 if no external cost was incurred.</p>
                            </div>
                            <MinimalInput
                                label="Performed By"
                                value={newLog.performedBy}
                                onChange={(e: any) => setNewLog({...newLog, performedBy: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Auto-expense checkbox */}
                    {(newLog.cost || 0) > 0 && (
                        <div
                            className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer"
                            onClick={() => setCreateExpense(!createExpense)}
                        >
                            <input
                                type="checkbox"
                                checked={createExpense}
                                onChange={(e) => setCreateExpense(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer mt-0.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                            />
                            <div>
                                <p className="text-sm font-semibold text-slate-700">Create expense record automatically</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Adds a <span className="font-bold text-slate-600">${newLog.cost}</span> entry to General Expenses under "Maintenance" — visible in the Expenses tab.</p>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2"
                        >
                            <Save size={14} /> Save & Update Schedule
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
      )}
    </div>
  );
};