import React, { useState } from 'react';
import { outsourcedBillboards, billboards as inventoryBillboards, addOutsourcedBillboard, updateOutsourcedBillboard, deleteOutsourcedBillboard } from '../services/mockData';
import { OutsourcedBillboard } from '../types';
import { Plus, X, Edit2, Globe, DollarSign, Calendar, Save, Trash2, AlertTriangle } from 'lucide-react';

const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);
const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

export const OutsourcedList: React.FC = () => {
  const [billboards, setBillboards] = useState<OutsourcedBillboard[]>(outsourcedBillboards);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBillboard, setCurrentBillboard] = useState<Partial<OutsourcedBillboard>>({});
  const [itemToDelete, setItemToDelete] = useState<OutsourcedBillboard | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const linkedBillboard = inventoryBillboards.find(b => b.id === currentBillboard.billboardId);
    if (currentBillboard.id) { const updated = { ...currentBillboard, billboardName: linkedBillboard?.name || 'Unknown' } as OutsourcedBillboard; updateOutsourcedBillboard(updated); setBillboards(prev => prev.map(b => b.id === updated.id ? updated : b)); } else { const newB: OutsourcedBillboard = { ...currentBillboard, id: `OUT-${Date.now()}`, billboardName: linkedBillboard?.name || 'Unknown', status: 'Active' } as OutsourcedBillboard; addOutsourcedBillboard(newB); setBillboards(prev => [...prev, newB]); }
    setIsModalOpen(false); setCurrentBillboard({});
  };
  const handleDeleteConfirm = () => { if(itemToDelete) { deleteOutsourcedBillboard(itemToDelete.id); setBillboards(prev => prev.filter(b => b.id !== itemToDelete.id)); setItemToDelete(null); } };
  const openAdd = () => { setCurrentBillboard({ monthlyPayout: 0, contractStart: '', contractEnd: '' }); setIsModalOpen(true); };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Outsourced Inventory</h2><p className="text-slate-500 font-medium">Assign existing billboards to 3rd party partners</p></div><button onClick={openAdd} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105"><Plus size={18} /> Assign Outsourced</button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {billboards.map(billboard => (
              <div key={billboard.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg transition-all group hover:-translate-y-1 duration-300">
                  <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm"><Globe size={20} /></div><div><h3 className="font-bold text-slate-900 leading-tight">{billboard.billboardName}</h3><p className="text-xs text-slate-500 font-mono">ID: {billboard.billboardId}</p></div></div><div className="flex gap-2"><button onClick={() => { setCurrentBillboard(billboard); setIsModalOpen(true); }} className="text-slate-300 hover:text-slate-600 transition-colors"><Edit2 size={16} /></button><button onClick={() => setItemToDelete(billboard)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div></div>
                  <div className="space-y-4 py-4 border-t border-slate-50"><div><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Media Owner (Partner)</p><p className="text-sm font-medium text-slate-800">{billboard.mediaOwner}</p><p className="text-xs text-slate-500">{billboard.ownerContact}</p></div><div className="grid grid-cols-2 gap-4"><div className="bg-green-50 p-3 rounded-xl border border-green-100"><div className="flex items-center gap-2 text-green-700 text-xs font-bold uppercase mb-1"><DollarSign size={12} /> Payout/Mo</div><p className="text-lg font-bold text-slate-900">${billboard.monthlyPayout.toLocaleString()}</p></div><div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-1"><Calendar size={12} /> Ends</div><p className="text-sm font-bold text-slate-800">{billboard.contractEnd}</p></div></div></div>
              </div>
          ))}
        </div>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Assign Billboard to Partner</h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleSave} className="p-8 space-y-6">
                        <MinimalSelect label="Select Billboard from Inventory" value={currentBillboard.billboardId} onChange={(e: any) => setCurrentBillboard({...currentBillboard, billboardId: e.target.value})} options={[{value: '', label: 'Select Asset...'}, ...inventoryBillboards.map(b => ({value: b.id, label: `${b.name} (${b.type})`}))]}/> 
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Partner Name" value={currentBillboard.mediaOwner || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, mediaOwner: e.target.value})} required />
                            <MinimalInput label="Partner Contact" value={currentBillboard.ownerContact || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, ownerContact: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Payout / Month ($)" type="number" value={currentBillboard.monthlyPayout} onChange={(e: any) => setCurrentBillboard({...currentBillboard, monthlyPayout: Number(e.target.value)})} />
                            <div className="space-y-4">
                                <MinimalInput label="Start Date" type="date" value={currentBillboard.contractStart || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractStart: e.target.value})} />
                                <MinimalInput label="End Date" type="date" value={currentBillboard.contractEnd || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractEnd: e.target.value})} />
                            </div>
                        </div>
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Save size={18} /> Save Assignment</button>
                    </form>
                </div>
            </div>
        </div>
      )}
      {itemToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setItemToDelete(null)} />
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50"><AlertTriangle className="text-red-500" size={32} /></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Assignment?</h3>
                    <p className="text-slate-500 mb-6 text-sm">Are you sure you want to remove the outsourced assignment for <span className="font-bold text-slate-700">{itemToDelete.billboardName}</span>?</p>
                    <div className="flex gap-3">
                        <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                        <button onClick={handleDeleteConfirm} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-500/30">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};