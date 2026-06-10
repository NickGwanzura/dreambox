import React, { useState, useMemo } from 'react';
import { Search, MapPin, Plus, Check } from 'lucide-react';
import { Billboard, BillboardType } from '../../types';
import { getBillboards } from '../../services/mockData';

interface CatalogueItem {
  description: string;
  amount: number;
  billboardId: string;
  side?: 'A' | 'B';
  slots?: number;
}

interface Props {
  onAddItems: (items: CatalogueItem[]) => void;
}

export const BillboardCatalogue: React.FC<Props> = ({ onAddItems }) => {
  const allBillboards = useMemo(() => getBillboards(), []);
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return lower
      ? allBillboards.filter(b =>
          b.name.toLowerCase().includes(lower) ||
          b.location.toLowerCase().includes(lower) ||
          b.town.toLowerCase().includes(lower)
        )
      : allBillboards;
  }, [allBillboards, search]);

  const groupedByTown = useMemo(() => {
    const groups: Record<string, Billboard[]> = {};
    filtered.forEach(b => {
      const town = b.town || 'Other';
      if (!groups[town]) groups[town] = [];
      groups[town].push(b);
    });
    return groups;
  }, [filtered]);

  const toggleItem = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddSelected = () => {
    const items: CatalogueItem[] = [];
    selectedItems.forEach(key => {
      const [billboardId, variant] = key.split('::');
      const b = allBillboards.find(x => x.id === billboardId);
      if (!b) return;
      if (variant === 'sideA') {
        items.push({ description: `${b.name} — ${b.location}, ${b.town} (Side A)`, amount: b.sideARate || 0, billboardId: b.id, side: 'A' });
      } else if (variant === 'sideB') {
        items.push({ description: `${b.name} — ${b.location}, ${b.town} (Side B)`, amount: b.sideBRate || 0, billboardId: b.id, side: 'B' });
      } else if (variant === 'led') {
        items.push({ description: `${b.name} — ${b.location}, ${b.town} (LED, 1 slot)`, amount: b.ratePerSlot || 0, billboardId: b.id, slots: 1 });
      }
    });
    onAddItems(items);
    setSelectedItems(new Set());
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-100 space-y-3">
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-2">
            <MapPin size={14} /> Billboard Catalogue
          </h5>
          <span className="text-[10px] text-slate-900">Click cards to select</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-900" size={14} />
          <input
            type="text"
            placeholder="Search by name, location, or town..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none"
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-4 p-4 pt-0">
        {Object.entries(groupedByTown).map(([town, boards]) => (
          <div key={town}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-2 flex items-center gap-1 sticky top-0 bg-white py-1">
              <MapPin size={10} /> {town}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {boards.map(b => {
                const isLED = b.type === BillboardType.LED;
                const availSlots = Math.max(0, (b.totalSlots || 0) - (b.rentedSlots || 0));
                return (
                  <div key={b.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{b.name}</p>
                        <p className="text-[11px] text-slate-900 truncate">{b.location}</p>
                      </div>
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                        {b.type}
                      </span>
                    </div>
                    {isLED ? (
                      <button
                        type="button"
                        onClick={() => toggleItem(`${b.id}::led`)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                          selectedItems.has(`${b.id}::led`)
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-900">LED Slot</p>
                          <p className="text-xs font-bold text-slate-800">${(b.ratePerSlot || 0).toLocaleString()}/slot</p>
                          <p className="text-[10px] text-slate-900">{availSlots} available</p>
                        </div>
                        {selectedItems.has(`${b.id}::led`) ? (
                          <Check size={16} className="text-indigo-600" />
                        ) : (
                          <Plus size={16} className="text-slate-400" />
                        )}
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => toggleItem(`${b.id}::sideA`)}
                          className={`flex flex-col p-2 rounded-lg border text-left transition-all ${
                            selectedItems.has(`${b.id}::sideA`)
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-slate-900">Side A</span>
                            {selectedItems.has(`${b.id}::sideA`) && <Check size={12} className="text-indigo-600" />}
                          </div>
                          <span className="text-xs font-bold text-slate-800">${(b.sideARate || 0).toLocaleString()}</span>
                          {b.sideAStatus && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase mt-1 w-fit ${
                              b.sideAStatus === 'Available' ? 'bg-green-100 text-green-700' :
                              b.sideAStatus === 'Rented' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-200 text-slate-900'
                            }`}>{b.sideAStatus}</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleItem(`${b.id}::sideB`)}
                          className={`flex flex-col p-2 rounded-lg border text-left transition-all ${
                            selectedItems.has(`${b.id}::sideB`)
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-slate-900">Side B</span>
                            {selectedItems.has(`${b.id}::sideB`) && <Check size={12} className="text-indigo-600" />}
                          </div>
                          <span className="text-xs font-bold text-slate-800">${(b.sideBRate || 0).toLocaleString()}</span>
                          {b.sideBStatus && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase mt-1 w-fit ${
                              b.sideBStatus === 'Available' ? 'bg-green-100 text-green-700' :
                              b.sideBStatus === 'Rented' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-200 text-slate-900'
                            }`}>{b.sideBStatus}</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-xs text-slate-900 italic py-6">No billboards found</p>
        )}
      </div>

      {selectedItems.size > 0 && (
        <div className="p-4 pt-0">
          <button
            type="button"
            onClick={handleAddSelected}
            className="w-full bg-slate-900 text-white rounded-xl px-4 py-2.5 hover:bg-slate-800 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider transition-all"
          >
            <Plus size={16} /> Add {selectedItems.size} Selected to Quote
          </button>
        </div>
      )}
    </div>
  );
};
