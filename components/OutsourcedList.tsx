import React, { useState } from 'react';
import { outsourcedBillboards, billboards as inventoryBillboards, addOutsourcedBillboard, updateOutsourcedBillboard, deleteOutsourcedBillboard } from '../services/mockData';
import { OutsourcedBillboard } from '../types';
import { Plus, X, Edit2, Globe, DollarSign, Calendar, Save, Trash2, AlertTriangle, CheckCircle, MapPin } from 'lucide-react';

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

  const isEditing = !!currentBillboard.id;

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
          {billboards.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                <Globe size={28} className="text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium mb-1">No outsourced assignments yet</p>
              <p className="text-xs text-slate-400">Assign a billboard to a media partner to get started.</p>
            </div>
          ) : billboards.map(billboard => (
              <div key={billboard.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg transition-all group hover:-translate-y-1 duration-300">
                  <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm"><Globe size={20} /></div><div><h3 className="font-bold text-slate-900 leading-tight">{billboard.billboardName}</h3><p className="text-xs text-slate-500 font-mono">ID: {billboard.billboardId}</p></div></div><div className="flex gap-2"><button onClick={() => { setCurrentBillboard(billboard); setIsModalOpen(true); }} className="text-slate-300 hover:text-slate-600 transition-colors"><Edit2 size={16} /></button><button onClick={() => setItemToDelete(billboard)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div></div>
                  <div className="space-y-4 py-4 border-t border-slate-50"><div><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Media Owner (Partner)</p><p className="text-sm font-medium text-slate-800">{billboard.mediaOwner}</p><p className="text-xs text-slate-500">{billboard.ownerContact}</p></div><div className="grid grid-cols-2 gap-4"><div className="bg-green-50 p-3 rounded-xl border border-green-100"><div className="flex items-center gap-2 text-green-700 text-xs font-bold uppercase mb-1"><DollarSign size={12} /> Payout/Mo</div><p className="text-lg font-bold text-slate-900">${billboard.monthlyPayout.toLocaleString()}</p></div><div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-1"><Calendar size={12} /> Ends</div><p className="text-sm font-bold text-slate-800">{billboard.contractEnd}</p></div></div></div>
              </div>
          ))}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">
                            {isEditing ? 'Edit Assignment' : 'Assign Billboard to Partner'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {isEditing
                                ? `${currentBillboard.billboardName || 'Billboard'} \u2022 ${currentBillboard.mediaOwner || 'Partner'}`
                                : 'Link an inventory asset to a media partner'}
                        </p>
                    </div>
                    <button onClick={() => { setIsModalOpen(false); setCurrentBillboard({}); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                </div>
                <form onSubmit={handleSave} className="p-8 space-y-6">

                    {/* Context card shown when editing */}
                    {isEditing && (
                        <div className="bg-slate-900 text-white rounded-2xl p-5">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Current Assignment</p>
                            <p className="font-bold text-base">{currentBillboard.billboardName}</p>
                            <div className="grid grid-cols-2 gap-4 border-t border-slate-700 pt-3 mt-3">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Partner</p>
                                    <p className="text-sm text-slate-300">{currentBillboard.mediaOwner || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Monthly Payout</p>
                                    <p className="text-sm font-semibold text-emerald-400">${(currentBillboard.monthlyPayout || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Billboard Selection */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Billboard Asset</p>
                        <MinimalSelect
                            label="Select Billboard from Inventory"
                            value={currentBillboard.billboardId}
                            onChange={(e: any) => setCurrentBillboard({...currentBillboard, billboardId: e.target.value})}
                            options={[{value: '', label: 'Select Asset...'}, ...inventoryBillboards.map(b => ({value: b.id, label: `${b.name} (${b.type})`}))]}
                        />
                        <p className="text-[10px] text-slate-400 mt-3">Only billboards already registered in Inventory can be outsourced.</p>
                    </div>

                    {/* Partner Details */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Partner Details</p>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Partner Name" value={currentBillboard.mediaOwner || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, mediaOwner: e.target.value})} required />
                            <MinimalInput label="Partner Contact" value={currentBillboard.ownerContact || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, ownerContact: e.target.value})} />
                        </div>
                    </div>

                    {/* Financial & Period */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Contract Terms</p>
                        <div>
                            <MinimalInput label="Monthly Payout ($)" type="number" value={currentBillboard.monthlyPayout} onChange={(e: any) => setCurrentBillboard({...currentBillboard, monthlyPayout: Number(e.target.value)})} />
                            <p className="text-[10px] text-slate-400 mt-2">Amount paid to the media owner each month for use of this asset.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <MinimalInput label="Start Date" type="date" value={currentBillboard.contractStart || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractStart: e.target.value})} />
                            </div>
                            <div>
                                <MinimalInput label="End Date" type="date" value={currentBillboard.contractEnd || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractEnd: e.target.value})} />
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400">Period during which this outsourced agreement is active.</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => { setIsModalOpen(false); setCurrentBillboard({}); }} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                        <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors flex items-center justify-center gap-2">
                            {isEditing ? <><CheckCircle size={14} /> Update Assignment</> : <><Save size={14} /> Save Assignment</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Delete Assignment Confirmation */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-sm w-full border border-white/20">
                {/* Header */}
                <div className="p-6 border-b border-red-100 bg-red-50 rounded-t-3xl flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-red-200">
                        <Trash2 className="text-red-600" size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-red-900">Remove Assignment?</h3>
                        <p className="text-xs text-red-500 mt-0.5 font-medium">This action cannot be undone.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {/* Entity being deleted */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Assignment Being Removed</p>
                        <p className="font-bold text-slate-900">{itemToDelete.billboardName}</p>
                        <p className="text-sm text-slate-600 flex items-center gap-2"><Globe size={13} className="text-slate-400 shrink-0" /> {itemToDelete.mediaOwner}</p>
                        {itemToDelete.ownerContact && (
                            <p className="text-xs text-slate-500">{itemToDelete.ownerContact}</p>
                        )}
                        <p className="text-xs text-slate-500 flex items-center gap-2"><DollarSign size={12} className="text-slate-400" /> ${itemToDelete.monthlyPayout.toLocaleString()}/month payout</p>
                        <p className="text-xs text-slate-400 font-mono mt-1">ID: {itemToDelete.id}</p>
                    </div>
                    {/* Impact warning */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 font-medium">Removing this assignment will unlink the billboard from this partner. The billboard asset will remain in your inventory.</p>
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Keep Assignment</button>
                        <button onClick={handleDeleteConfirm} className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-600/20">Remove Permanently</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
