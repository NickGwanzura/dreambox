
import React, { useState, useEffect, useRef } from 'react';
import { Billboard, BillboardType, Client, Contract } from '../types';
import { getBillboards, addBillboard, updateBillboard, deleteBillboard, clients, ZIM_TOWNS, addClient, addContract, getClients, updateClient, getContracts, subscribe } from '../services/mockData';
import { analyzeBillboardLocation } from '../services/aiService';
import { MapPin, X, Edit2, Save, Plus, Image as ImageIcon, Map as MapIcon, Grid as GridIcon, Trash2, AlertTriangle, Share2, Eye, List as ListIcon, Search, Link2, Upload, Download, Layers, Users, Sparkles, RefreshCw, Car, ZoomIn, Maximize2, Hash, Zap, MousePointer2, FileText, Globe } from 'lucide-react';
import L from 'leaflet';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative pt-5">
    <input type={type} required={required} value={value as any} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative pt-5">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

// Helper to generate a consistent premium gradient using standard classes
const getPlaceholderGradient = (id: string) => {
    const gradients = [
        "bg-gradient-to-br from-slate-800 to-slate-600",
        "bg-gradient-to-br from-indigo-900 to-indigo-700",
        "bg-gradient-to-br from-emerald-900 to-emerald-700",
        "bg-gradient-to-br from-red-900 to-red-700",
        "bg-gradient-to-br from-blue-900 to-blue-700",
        "bg-gradient-to-br from-violet-900 to-violet-700",
    ];
    const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length;
    return gradients[index];
};

// Strict check for valid image URL to prevent 'null' string issues from CSV imports
const hasValidImage = (url?: string) => {
    if (!url) return false;
    const s = url.toLowerCase().trim();
    if (s === '' || s === 'null' || s === 'undefined') return false;
    return true;
};

// Dynamic Availability Checker for List Display
const getAvailabilityStatus = (billboard: Billboard) => {
    const today = new Date();
    const activeContracts = getContracts().filter(c => 
        c.billboardId === billboard.id && 
        c.status === 'Active' &&
        new Date(c.startDate) <= today && 
        new Date(c.endDate) >= today
    );

    if (billboard.type === 'Static') {
        const sideABooked = activeContracts.some(c => c.side === 'A' || c.side === 'Both');
        const sideBBooked = activeContracts.some(c => c.side === 'B' || c.side === 'Both');
        
        if (sideABooked && sideBBooked) return 'Booked';
        if (sideABooked || sideBBooked) return 'Partial'; // One side available
        return 'Open';
    } else {
        // LED
        const bookedCount = activeContracts.length;
        if (bookedCount >= (billboard.totalSlots || 1)) return 'Booked';
        return 'Open';
    }
}

interface BillboardCardProps {
  billboard: Billboard;
  index: number;
  onEdit: (b: Billboard) => void;
  onDelete: (b: Billboard) => void;
  getClientName: (id?: string) => string;
  onShare: (b: Billboard) => void;
  onViewImage: (url: string) => void;
}

const BillboardCard: React.FC<BillboardCardProps> = ({ billboard, index, onEdit, onDelete, getClientName, onShare, onViewImage }) => {
    const status = getAvailabilityStatus(billboard);
    const isAvailable = status === 'Open';
    const isPartial = status === 'Partial';

    const gradientClass = getPlaceholderGradient(billboard.id);
    const hasImage = hasValidImage(billboard.imageUrl);

    return (
        <div className="group relative bg-white rounded-[2rem] shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 border border-slate-100 transition-all duration-500 flex flex-col h-full overflow-hidden hover:-translate-y-2">
            {/* Image Header */}
            <div className={`h-72 relative overflow-hidden cursor-zoom-in ${!hasImage ? gradientClass : 'bg-slate-100'}`} onClick={() => hasImage && onViewImage(billboard.imageUrl!)}>
                {hasImage ? (
                    <img 
                        src={billboard.imageUrl} 
                        alt={billboard.name} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={(e) => {
                            // Fallback if image fails to load even if URL looked valid
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement?.classList.add(...gradientClass.split(' '));
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white/40 p-6 text-center">
                        <ImageIcon size={48} strokeWidth={1} className="mb-3 opacity-50"/>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">No Visual</span>
                    </div>
                )}
                
                {/* Gradient Overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-500"></div>

                {/* Top Badges */}
                <div className="absolute top-5 left-5 right-5 flex justify-between items-start pointer-events-none z-10">
                    <div className="flex gap-2">
                        <span className="flex items-center justify-center w-8 h-8 bg-white/10 backdrop-blur-md text-white font-bold text-xs rounded-full border border-white/20 shadow-lg">
                            {index}
                        </span>
                        {billboard.type === 'LED' && (
                             <span className="flex items-center justify-center w-8 h-8 bg-indigo-500/80 backdrop-blur-md text-white rounded-full border border-white/20 shadow-lg" title="Digital LED">
                                <Zap size={14} fill="currentColor"/>
                             </span>
                        )}
                    </div>
                    <span className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full backdrop-blur-xl shadow-lg border flex items-center gap-2 transition-colors ${isAvailable ? 'bg-emerald-500/90 text-white border-emerald-400/50' : isPartial ? 'bg-amber-500/90 text-white border-amber-400/50' : 'bg-rose-500/90 text-white border-rose-400/50'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-white animate-pulse' : 'bg-white'}`}></span>
                        {isAvailable ? 'Open' : isPartial ? '1 Side Open' : 'Booked'}
                    </span>
                </div>
            </div>

            {/* Content Body */}
            <div className="p-6 sm:p-7 flex-1 flex flex-col relative bg-white">
                
                <div className="mb-6">
                    <div className="flex justify-between items-start gap-4 mb-2">
                        <h3 className="font-extrabold text-2xl text-slate-900 leading-tight tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-2" title={billboard.name}>
                            {billboard.name}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <MapPin size={14} className="text-indigo-500 shrink-0"/> 
                        <span className="truncate">{billboard.location}, {billboard.town}</span>
                    </div>
                </div>

                {/* Premium Stats Grid */}
                <div className="grid grid-cols-3 gap-4 py-5 border-t border-slate-50 mb-6">
                    <div className="flex flex-col items-center justify-center text-center gap-1 group/stat hover:bg-slate-50 rounded-xl p-1 transition-colors">
                        <span className="text-slate-400"><Car size={18}/></span>
                        <span className="text-xs font-bold text-slate-700">{billboard.dailyTraffic ? (billboard.dailyTraffic / 1000).toFixed(0) + 'k' : '-'}</span>
                        <span className="text-[9px] uppercase font-bold text-slate-300 tracking-wider">Views</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center gap-1 group/stat hover:bg-slate-50 rounded-xl p-1 transition-colors border-l border-r border-slate-50">
                        <span className="text-slate-400"><Maximize2 size={18}/></span>
                        <span className="text-xs font-bold text-slate-700">{billboard.width}x{billboard.height}</span>
                        <span className="text-[9px] uppercase font-bold text-slate-300 tracking-wider">Meters</span>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center gap-1 group/stat hover:bg-slate-50 rounded-xl p-1 transition-colors">
                        <span className="text-slate-400"><Layers size={18}/></span>
                        <span className="text-xs font-bold text-slate-700">{billboard.type === 'Static' ? '2 Sides' : `${billboard.totalSlots} Slots`}</span>
                        <span className="text-[9px] uppercase font-bold text-slate-300 tracking-wider">Format</span>
                    </div>
                </div>

                {/* AI Insight Pill */}
                {billboard.visibility && (
                    <div className="mb-6 bg-gradient-to-r from-slate-50 to-white border border-slate-100 p-4 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                        <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <Sparkles size={10} fill="currentColor"/> AI Analysis
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                            {billboard.visibility}
                        </p>
                    </div>
                )}

                {/* Action Bar */}
                <div className="mt-auto flex items-center justify-between pt-4 gap-3">
                    <span className="text-[10px] font-mono text-slate-300 bg-slate-50 px-2 py-1 rounded-md">ID: {billboard.id.slice(-4)}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(billboard); }} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Edit">
                            <Edit2 size={18} strokeWidth={2}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onShare(billboard); }} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Share Public Link">
                            <Share2 size={18} strokeWidth={2}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(billboard); }} className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Delete">
                            <Trash2 size={18} strokeWidth={2}/>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const BillboardList: React.FC = () => {
  const [billboards, setBillboards] = useState<Billboard[]>(getBillboards());
  const [filter, setFilter] = useState<'All' | 'Static' | 'LED'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientView, setIsClientView] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const pickerMapRef = useRef<L.Map | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement>(null);
  
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editingBillboard, setEditingBillboard] = useState<Billboard | null>(null);
  const [billboardToDelete, setBillboardToDelete] = useState<Billboard | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  
  const [newBillboard, setNewBillboard] = useState<Partial<Billboard>>({
    name: '', location: '', town: 'Harare', type: BillboardType.Static, width: 0, height: 0,
    sideARate: 0, sideBRate: 0, ratePerSlot: 0, totalSlots: 10, rentedSlots: 0, imageUrl: '', visibility: '', dailyTraffic: 0,
    sideAStatus: 'Available', sideBStatus: 'Available',
    coordinates: { lat: -17.8292, lng: 31.0522 },
    notes: ''
  });

  // Real-time Subscription
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          setBillboards([...getBillboards()]);
      });
      return () => { unsubscribe(); };
  }, []);

  const filteredBillboards = billboards.filter(b => {
    const matchesFilter = filter === 'All' ? true : b.type === filter;
    const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          b.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.town.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Main Map View Logic
  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    try {
        const map = L.map(mapContainerRef.current).setView([-17.824858, 31.053028], 13);
        mapRef.current = map;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: 'OpenStreetMap', maxZoom: 19 }).addTo(map);
        const DefaultIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
        
        filteredBillboards.forEach(b => {
            if (b.coordinates) {
                const popupContent = isClientView ? `<div><strong>${b.name}</strong></div>` : `<div><strong>${b.name}</strong><div>${b.location}</div></div>`;
                L.marker([b.coordinates.lat, b.coordinates.lng], { icon: DefaultIcon }).addTo(map).bindPopup(popupContent);
            }
        });

        if (showHeatmap) {
            const heatPoints = [
                { lat: -17.8292, lng: 31.0522, r: 800, color: 'red' }, 
                { lat: -17.825, lng: 31.033, r: 600, color: 'orange' }, 
                { lat: -17.863, lng: 31.029, r: 500, color: 'orange' }, 
                { lat: -17.785, lng: 31.053, r: 500, color: 'red' }, 
                { lat: -17.91, lng: 31.13, r: 400, color: 'red' }, 
                ...filteredBillboards.map(b => ({ lat: b.coordinates.lat, lng: b.coordinates.lng, r: 200, color: 'blue' }))
            ];

            heatPoints.forEach(p => {
                L.circle([p.lat, p.lng], {
                    color: p.color,
                    fillColor: p.color,
                    fillOpacity: 0.3,
                    radius: p.r,
                    stroke: false
                }).addTo(map);
            });
        }

    } catch (e) { console.error("Failed to initialize map:", e); }
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }
  }, [viewMode, filter, isClientView, searchTerm, showHeatmap]); 

  // Location Picker Map Logic
  useEffect(() => {
      // Only initialize if modal is open AND picker is requested
      if (!isAddModalOpen && !editingBillboard) return;
      if (!pickingLocation) return;
      
      // Delay slightly to allow DOM to render
      const timer = setTimeout(() => {
          if (!pickerContainerRef.current) return;
          if (pickerMapRef.current) { pickerMapRef.current.remove(); pickerMapRef.current = null; }

          const target = editingBillboard || newBillboard;
          const initialLat = target.coordinates?.lat || -17.8292;
          const initialLng = target.coordinates?.lng || 31.0522;

          const map = L.map(pickerContainerRef.current).setView([initialLat, initialLng], 14);
          pickerMapRef.current = map;
          
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
          
          const DefaultIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
          
          let marker = L.marker([initialLat, initialLng], { icon: DefaultIcon, draggable: true }).addTo(map);

          map.on('click', (e) => {
              const { lat, lng } = e.latlng;
              marker.setLatLng([lat, lng]);
              updateCoordinates(lat, lng);
          });

          marker.on('dragend', (e) => {
              const { lat, lng } = (e.target as L.Marker).getLatLng();
              updateCoordinates(lat, lng);
          });

      }, 100);

      return () => clearTimeout(timer);
  }, [pickingLocation, isAddModalOpen, editingBillboard]);

  const updateCoordinates = (lat: number, lng: number) => {
      if (editingBillboard) {
          setEditingBillboard(prev => prev ? ({ ...prev, coordinates: { lat, lng } }) : null);
      } else {
          setNewBillboard(prev => ({ ...prev, coordinates: { lat, lng } }));
      }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBillboard) { updateBillboard(editingBillboard); setEditingBillboard(null); setPickingLocation(false); }
  };
  const handleConfirmDelete = () => {
      if (billboardToDelete) { deleteBillboard(billboardToDelete.id); setBillboardToDelete(null); }
  };
  
  // ... (Other handlers unchanged)
  const handleAddBillboard = (e: React.FormEvent) => {
    e.preventDefault();
    const billboard: Billboard = {
      id: (Date.now()).toString(), name: newBillboard.name!, location: newBillboard.location!, town: newBillboard.town || 'Harare', type: newBillboard.type!, width: newBillboard.width!, height: newBillboard.height!,
      sideARate: newBillboard.sideARate, sideBRate: newBillboard.sideBRate, ratePerSlot: newBillboard.ratePerSlot, totalSlots: newBillboard.totalSlots, rentedSlots: 0,
      sideAStatus: 'Available', sideBStatus: 'Available', imageUrl: newBillboard.imageUrl || '', visibility: newBillboard.visibility, dailyTraffic: newBillboard.dailyTraffic, coordinates: newBillboard.coordinates || { lat: -17.82, lng: 31.05 },
      notes: newBillboard.notes
    };
    addBillboard(billboard); setIsAddModalOpen(false); setPickingLocation(false);
    setNewBillboard({ name: '', location: '', town: 'Harare', type: BillboardType.Static, width: 0, height: 0, sideARate: 0, sideBRate: 0, ratePerSlot: 0, totalSlots: 10, rentedSlots: 0, imageUrl: '', visibility: '', dailyTraffic: 0, coordinates: { lat: -17.8292, lng: 31.0522 }, sideAStatus: 'Available', sideBStatus: 'Available', notes: '' });
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            if (isEdit && editingBillboard) { setEditingBillboard({...editingBillboard, imageUrl: base64}); } else { setNewBillboard({...newBillboard, imageUrl: base64}); }
        };
        reader.readAsDataURL(file);
    }
  };
  const handleAutoAnalyze = async (isEdit: boolean) => {
      const target = isEdit ? editingBillboard : newBillboard;
      if (!target?.location || !target?.town) { alert("Please enter Location and Town first."); return; }
      
      setIsAnalyzing(true);
      const result = await analyzeBillboardLocation(target.location, target.town);
      setIsAnalyzing(false);
      
      const updates = { 
          visibility: result.visibility, 
          dailyTraffic: result.dailyTraffic,
          // Only update coords if AI returned them
          ...(result.coordinates ? { coordinates: result.coordinates } : {})
      };
      
      if (isEdit && editingBillboard) {
          setEditingBillboard({ ...editingBillboard, ...updates });
      } else {
          setNewBillboard({ ...newBillboard, ...updates });
      }
      
      if(result.coordinates) {
          alert(`AI Analysis Complete!\nCoordinates found: ${result.coordinates.lat}, ${result.coordinates.lng}`);
      }
  };

  const getClientName = (clientId?: string) => { if(!clientId) return 'Available'; return clients.find(c => c.id === clientId)?.companyName || 'Unknown'; };
  
  const shareBillboard = (b: Billboard) => { 
      const url = `${window.location.origin}${window.location.pathname}?public=true&type=billboard&id=${b.id}`;
      navigator.clipboard.writeText(url); 
      alert("Public Share Link copied to clipboard!\nAnyone with this link can view this billboard details."); 
  };

  const shareMap = () => {
      const url = `${window.location.origin}${window.location.pathname}?public=true&type=map`;
      navigator.clipboard.writeText(url);
      alert("Public Map Link copied to clipboard!\n\nThis link allows read-only access to your full inventory map.");
  }

  const downloadTemplate = () => {
      const headers = "Name,Location,Town,Type(Static/LED),Width,Height,Card_Rate_A,Card_Rate_B,Latitude,Longitude,Client_Name,Start_Date,End_Date,Side_or_Slot,Agreed_Monthly_Rate,Billing_Day";
      const example = "Main Airport Rd,Airport Approach,Harare,Static,12,3,500,500,-17.892,31.105,Delta Beverages,2025-01-01,2025-12-31,A,450,25";
      const csv = `${headers}\n${example}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'billboard_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportBillboards = () => {
      const headers = "ID,Name,Location,Town,Type,Width,Height,Last_Maintenance,Coordinates,SideA_Status,SideB_Status";
      const rows = billboards.map(b => 
          `${b.id},"${b.name}","${b.location}",${b.town},${b.type},${b.width},${b.height},${b.lastMaintenanceDate || 'N/A'},"${b.coordinates.lat},${b.coordinates.lng}",${b.sideAStatus || 'N/A'},${b.sideBStatus || 'N/A'}`
      );
      
      const csv = [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `billboard_inventory_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleImportBillboards = (e: React.ChangeEvent<HTMLInputElement>) => {
      // ... (import logic remains the same)
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          const lines = text.split('\n').slice(1);
          let importedCount = 0;
          let contractsCreated = 0;

          lines.forEach(line => {
              if (!line.trim()) return;
              const cols = line.split(',').map(c => c.trim());
              if (cols.length < 4) return;

              const [name, location, town, typeStr, width, height, rateA, rateB, lat, lng, clientName, startDate, endDate, sideOrSlot, agreedRate, billingDay] = cols;
              
              const newBoard: Billboard = {
                  id: `IMP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                  name: name || 'Imported Billboard',
                  location: location || 'Unknown',
                  town: town || 'Harare',
                  type: typeStr?.toLowerCase() === 'led' ? BillboardType.LED : BillboardType.Static,
                  width: Number(width) || 0,
                  height: Number(height) || 0,
                  sideARate: Number(rateA) || 0,
                  sideBRate: Number(rateB) || 0,
                  ratePerSlot: Number(rateA) || 0,
                  totalSlots: 10,
                  rentedSlots: 0,
                  coordinates: { lat: Number(lat) || -17.82, lng: Number(lng) || 31.05 },
                  sideAStatus: 'Available',
                  sideBStatus: 'Available',
                  visibility: 'Imported Data',
                  imageUrl: '' 
              };
              addBillboard(newBoard);
              importedCount++;

              if (clientName && startDate && endDate) {
                  const currentClients = getClients();
                  let client = currentClients.find(c => c.companyName.toLowerCase() === clientName.toLowerCase());
                  const preferredBillingDay = billingDay ? parseInt(billingDay, 10) : undefined;

                  if (!client) {
                      const newClient: Client = {
                          id: `CLI-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                          companyName: clientName,
                          contactPerson: 'Imported Contact',
                          email: '',
                          phone: '',
                          status: 'Active',
                          billingDay: preferredBillingDay
                      };
                      addClient(newClient);
                      client = newClient;
                  } else if (preferredBillingDay && client.billingDay !== preferredBillingDay) {
                      updateClient({ ...client, billingDay: preferredBillingDay });
                  }

                  const isSideA = sideOrSlot?.toUpperCase() === 'A';
                  const isSideB = sideOrSlot?.toUpperCase() === 'B';
                  const isBoth = sideOrSlot?.toUpperCase() === 'BOTH';
                  
                  let contractDetails = sideOrSlot || 'Standard';
                  let monthlyRate = 0;

                  if (agreedRate && Number(agreedRate) > 0) {
                      monthlyRate = Number(agreedRate);
                  } else {
                      if (newBoard.type === BillboardType.Static) {
                          if (isSideA) monthlyRate = newBoard.sideARate || 0;
                          else if (isSideB) monthlyRate = newBoard.sideBRate || 0;
                          else if (isBoth) monthlyRate = (newBoard.sideARate || 0) + (newBoard.sideBRate || 0);
                      } else {
                          monthlyRate = newBoard.ratePerSlot || 0;
                      }
                  }

                  const newContract: Contract = {
                      id: `CNT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                      clientId: client.id,
                      billboardId: newBoard.id,
                      startDate: startDate,
                      endDate: endDate,
                      monthlyRate: monthlyRate,
                      installationCost: 0,
                      printingCost: 0,
                      hasVat: true,
                      totalContractValue: monthlyRate * 12,
                      status: 'Active',
                      details: contractDetails,
                      side: isSideA ? 'A' : isSideB ? 'B' : isBoth ? 'Both' : undefined
                  };
                  
                  addContract(newContract);
                  contractsCreated++;
              }
          });
          alert(`Import Successful!\n• ${importedCount} Billboards added.\n• ${contractsCreated} Contracts created & linked.`);
          if (importInputRef.current) importInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  return (
    <>
      <div className="space-y-8 relative font-sans h-[calc(100vh-140px)] flex flex-col animate-fade-in">
        {/* ... (View Controls) ... */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Inventory</h2><p className="text-slate-500 font-medium">Manage and monitor your digital and static assets</p></div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
             <div className="relative group w-full sm:w-72">
                <Search className="absolute left-4 top-3 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search location or name..." className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-full bg-white/80 backdrop-blur-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm shadow-sm"/>
             </div>
             <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <div className="flex bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 p-1 shadow-sm">
                    <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-full transition-all ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`} title="Grid View"><GridIcon size={18} /></button>
                    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-full transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`} title="List View"><ListIcon size={18} /></button>
                    <button onClick={() => setViewMode('map')} className={`p-2.5 rounded-full transition-all ${viewMode === 'map' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`} title="Map View"><MapIcon size={18} /></button>
                </div>
                
                <div className="flex bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 p-1 shadow-sm items-center">
                    <button onClick={downloadTemplate} className="p-2.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Download CSV Template"><Download size={18}/></button>
                    <label className="p-2.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer" title="Import Billboards CSV">
                        <Upload size={18}/>
                        <input type="file" ref={importInputRef} accept=".csv" className="hidden" onChange={handleImportBillboards} />
                    </label>
                    <button onClick={handleExportBillboards} className="p-2.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Export Inventory to CSV"><FileText size={18}/></button>
                    <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
                    <button onClick={shareMap} className="p-2.5 rounded-full text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-all" title="Share Public Map Link"><Globe size={18}/></button>
                </div>

                <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2"><Plus size={18} /> Add Billboard</button>
             </div>
          </div>
        </div>

        {viewMode === 'map' ? (
             <div className="flex-1 rounded-3xl overflow-hidden shadow-inner border border-slate-200 relative">
                 <div ref={mapContainerRef} className="w-full h-full bg-slate-100 z-0"></div>
                 <div className="absolute top-4 right-4 z-[400] bg-white p-2 rounded-xl shadow-lg border border-slate-200 flex flex-col gap-2">
                     <button 
                        onClick={() => setShowHeatmap(!showHeatmap)} 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${showHeatmap ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                     >
                         <Layers size={14} /> {showHeatmap ? 'Hide Traffic Heat' : 'Show Traffic Heat'}
                     </button>
                     <button 
                        onClick={shareMap} 
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                     >
                         <Globe size={14} /> Share Public Map
                     </button>
                 </div>
             </div>
        ) : (
            <div className={`flex-1 overflow-y-auto pr-2 pb-20 ${viewMode === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}`}>
                {filteredBillboards.map((b, idx) => {
                    // ... (render billboard cards logic same as before)
                    const status = getAvailabilityStatus(b);
                    const isAvailable = status === 'Open';
                    const isPartial = status === 'Partial';
                    const gradientClass = getPlaceholderGradient(b.id);
                    const hasImage = hasValidImage(b.imageUrl);

                    return viewMode === 'list' ? (
                         <div key={b.id} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-xl transition-all group hover:-translate-y-1">
                             <div className="relative">
                                 <div className="absolute -top-2 -left-2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10 border border-white/20">#{idx + 1}</div>
                                 <div className={`w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-slate-100 shadow-sm relative group-hover:scale-105 transition-transform ${!hasImage ? gradientClass : ''}`}>
                                     {hasImage ? (
                                         <img 
                                            src={b.imageUrl} 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement?.classList.add(...gradientClass.split(' ')); }}
                                         />
                                     ) : ( <div className="w-full h-full flex items-center justify-center text-white/30"><ImageIcon size={28}/></div> )}
                                 </div>
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-3 mb-1">
                                     <h4 className="font-bold text-slate-900 truncate text-lg tracking-tight" title={b.name}>{b.name}</h4>
                                     <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shrink-0 ${isAvailable ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : isPartial ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                         {isAvailable ? 'Open' : isPartial ? '1 Side Open' : 'Booked'}
                                     </span>
                                 </div>
                                 <p className="text-xs text-slate-500 font-medium flex items-center gap-1 truncate mb-2">
                                     <MapPin size={12} className="shrink-0 text-indigo-500"/> <span className="truncate">{b.location}, {b.town}</span>
                                 </p>
                                 <div className="flex gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                                     <span className="flex items-center gap-1"><Maximize2 size={10}/> {b.width}x{b.height}m</span>
                                     <span className="flex items-center gap-1"><Car size={10}/> {b.dailyTraffic ? (b.dailyTraffic/1000).toFixed(0)+'k' : '-'} Views</span>
                                 </div>
                             </div>
                             <div className="flex items-center gap-4 sm:border-l sm:border-slate-100 sm:pl-6 pt-4 sm:pt-0 border-t border-slate-50 sm:border-t-0 mt-2 sm:mt-0 w-full sm:w-auto justify-between sm:justify-start">
                                 <div className="flex flex-col items-end mr-2">
                                     <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-1 ${b.type === BillboardType.LED ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}>{b.type}</span>
                                     <span className="text-[10px] text-slate-400 font-mono">ID: {b.id.slice(-4)}</span>
                                 </div>
                                 <div className="flex gap-2">
                                     <button onClick={() => setEditingBillboard(b)} className="p-2.5 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors" title="Edit"><Edit2 size={16}/></button>
                                     <button onClick={() => setBillboardToDelete(b)} className="p-2.5 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-xl transition-colors" title="Delete"><Trash2 size={16}/></button>
                                 </div>
                             </div>
                         </div>
                    ) : (
                        <BillboardCard key={b.id} billboard={b} index={idx + 1} onEdit={setEditingBillboard} onDelete={setBillboardToDelete} getClientName={getClientName} onShare={shareBillboard} onViewImage={(url) => setViewImage(url)} />
                    )
                })}
            </div>
        )}
      </div>

      {/* ... (Image Viewer & Add Modal unchanged) ... */}
      {viewImage && (
          <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewImage(null)}>
              <div className="relative max-w-7xl max-h-full w-full h-full flex flex-col items-center justify-center">
                  <img src={viewImage} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}/>
                  <div className="absolute top-4 right-4 flex gap-4">
                      <a href={viewImage} download="billboard_image" className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors" onClick={(e) => e.stopPropagation()}>
                          <Download size={24} />
                      </a>
                      <button className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors" onClick={() => setViewImage(null)}>
                          <X size={24} />
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Add Modal... */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => { setIsAddModalOpen(false); setPickingLocation(false); }} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl border border-white/20">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Add New Billboard</h3>
                        <button onClick={() => { setIsAddModalOpen(false); setPickingLocation(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400"/></button>
                    </div>
                    <form onSubmit={handleAddBillboard} className="p-8 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Name" value={newBillboard.name} onChange={(e: any) => setNewBillboard({...newBillboard, name: e.target.value})} required />
                            <MinimalSelect label="Type" value={newBillboard.type} onChange={(e: any) => setNewBillboard({...newBillboard, type: e.target.value})} options={[{value: 'Static', label: 'Static Billboard'},{value: 'LED', label: 'Digital LED Screen'}]} />
                        </div>
                        <MinimalInput label="Location" value={newBillboard.location} onChange={(e: any) => setNewBillboard({...newBillboard, location: e.target.value})} required />
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalSelect label="Town" value={newBillboard.town} onChange={(e: any) => setNewBillboard({...newBillboard, town: e.target.value})} options={ZIM_TOWNS.map(t => ({value: t, label: t}))} />
                            <div className="flex gap-4 items-end">
                                <div className="flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <MinimalInput label="Lat" type="number" value={newBillboard.coordinates?.lat} onChange={(e: any) => setNewBillboard({...newBillboard, coordinates: {...newBillboard.coordinates!, lat: Number(e.target.value)}})} />
                                        <MinimalInput label="Lng" type="number" value={newBillboard.coordinates?.lng} onChange={(e: any) => setNewBillboard({...newBillboard, coordinates: {...newBillboard.coordinates!, lng: Number(e.target.value)}})} />
                                    </div>
                                </div>
                                <button type="button" onClick={() => setPickingLocation(!pickingLocation)} className={`mb-2 p-2 rounded-lg transition-colors ${pickingLocation ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} title="Pick on Map">
                                    <MousePointer2 size={18}/>
                                </button>
                            </div>
                        </div>
                        {pickingLocation && (
                            <div className="h-64 w-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative animate-fade-in">
                                <div ref={pickerContainerRef} className="w-full h-full z-0"></div>
                                <div className="absolute bottom-2 left-2 z-[400] bg-white/90 px-3 py-1 text-[10px] rounded-lg shadow font-bold text-slate-600">Drag marker to set position</div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Width (m)" type="number" value={newBillboard.width} onChange={(e: any) => setNewBillboard({...newBillboard, width: Number(e.target.value)})} required />
                            <MinimalInput label="Height (m)" type="number" value={newBillboard.height} onChange={(e: any) => setNewBillboard({...newBillboard, height: Number(e.target.value)})} required />
                        </div>
                        
                        {/* Dynamic Rates based on Type */}
                        {newBillboard.type === BillboardType.Static ? (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Rate Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Side A Rate ($)" type="number" value={newBillboard.sideARate} onChange={(e: any) => setNewBillboard({...newBillboard, sideARate: Number(e.target.value)})} />
                                    <MinimalInput label="Side B Rate ($)" type="number" value={newBillboard.sideBRate} onChange={(e: any) => setNewBillboard({...newBillboard, sideBRate: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 italic">Availability is controlled automatically by Rental Agreements.</p>
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Digital Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Total Slots" type="number" value={newBillboard.totalSlots} onChange={(e: any) => setNewBillboard({...newBillboard, totalSlots: Number(e.target.value)})} />
                                    <MinimalInput label="Rate Per Slot ($)" type="number" value={newBillboard.ratePerSlot} onChange={(e: any) => setNewBillboard({...newBillboard, ratePerSlot: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Occupancy is calculated based on active contracts vs Total Slots.</p>
                            </div>
                        )}

                        <div className="group relative">
                            <textarea value={newBillboard.notes} onChange={(e) => setNewBillboard({...newBillboard, notes: e.target.value})} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent h-20 resize-none"/>
                            <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">Internal Notes (Optional)</label>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Billboard Image</label>
                            <div className="flex items-center gap-4">
                                {newBillboard.imageUrl && <img src={newBillboard.imageUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />}
                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all"/>
                            </div>
                        </div>

                        {/* Analysis Section */}
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4 relative z-10">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-2"><Sparkles size={14}/> Analysis & Traffic</h4>
                                <button type="button" onClick={() => handleAutoAnalyze(false)} disabled={isAnalyzing} className="text-[10px] bg-white text-indigo-600 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider shadow-sm border border-indigo-100 hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50">
                                    {isAnalyzing ? <RefreshCw size={12} className="animate-spin"/> : <Sparkles size={12}/>} {isAnalyzing ? 'Analyzing...' : 'Auto-Generate'}
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                <div className="md:col-span-2">
                                    <MinimalInput label="Visibility Notes (AI)" value={newBillboard.visibility} onChange={(e: any) => setNewBillboard({...newBillboard, visibility: e.target.value})} />
                                </div>
                                <div>
                                    <MinimalInput label="Est. Daily Traffic" type="number" value={newBillboard.dailyTraffic} onChange={(e: any) => setNewBillboard({...newBillboard, dailyTraffic: Number(e.target.value)})} />
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">
                            <Save size={18} /> Save Asset
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {/* Edit Modal - UPDATED with Width/Height */}
      {editingBillboard && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => { setEditingBillboard(null); setPickingLocation(false); }} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl border border-white/20">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Edit Billboard</h3>
                        <button onClick={() => { setEditingBillboard(null); setPickingLocation(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400"/></button>
                    </div>
                    <form onSubmit={handleSaveEdit} className="p-8 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Name" value={editingBillboard.name} onChange={(e: any) => setEditingBillboard({...editingBillboard, name: e.target.value})} required />
                            <MinimalSelect 
                                label="Type" 
                                value={editingBillboard.type} 
                                onChange={(e: any) => {
                                    const newType = e.target.value;
                                    const defaults = newType === 'LED' 
                                        ? { totalSlots: editingBillboard.totalSlots || 10, ratePerSlot: editingBillboard.ratePerSlot || 0 }
                                        : { sideARate: editingBillboard.sideARate || 0, sideBRate: editingBillboard.sideBRate || 0 };
                                    setEditingBillboard({...editingBillboard, type: newType, ...defaults});
                                }} 
                                options={[{value: 'Static', label: 'Static Billboard'},{value: 'LED', label: 'Digital LED Screen'}]} 
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Location" value={editingBillboard.location} onChange={(e: any) => setEditingBillboard({...editingBillboard, location: e.target.value})} required />
                            <MinimalSelect label="Town" value={editingBillboard.town} onChange={(e: any) => setEditingBillboard({...editingBillboard, town: e.target.value})} options={ZIM_TOWNS.map(t => ({value: t, label: t}))} />
                        </div>

                        <div className="flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                                <div className="flex gap-2">
                                    <MinimalInput label="Lat" type="number" value={editingBillboard.coordinates?.lat} onChange={(e: any) => setEditingBillboard({...editingBillboard, coordinates: {...editingBillboard.coordinates!, lat: Number(e.target.value)}})} />
                                    <MinimalInput label="Lng" type="number" value={editingBillboard.coordinates?.lng} onChange={(e: any) => setEditingBillboard({...editingBillboard, coordinates: {...editingBillboard.coordinates!, lng: Number(e.target.value)}})} />
                                </div>
                            </div>
                            <button type="button" onClick={() => setPickingLocation(!pickingLocation)} className={`mb-2 p-2 rounded-lg transition-colors ${pickingLocation ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} title="Pick on Map">
                                <MousePointer2 size={18}/>
                            </button>
                        </div>

                        {pickingLocation && (
                            <div className="h-64 w-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative animate-fade-in">
                                <div ref={pickerContainerRef} className="w-full h-full z-0"></div>
                                <div className="absolute bottom-2 left-2 z-[400] bg-white/90 px-3 py-1 text-[10px] rounded-lg shadow font-bold text-slate-600">Drag marker to set position</div>
                            </div>
                        )}

                        {/* NEW: Dimensions Inputs */}
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Width (m)" type="number" value={editingBillboard.width} onChange={(e: any) => setEditingBillboard({...editingBillboard, width: Number(e.target.value)})} required />
                            <MinimalInput label="Height (m)" type="number" value={editingBillboard.height} onChange={(e: any) => setEditingBillboard({...editingBillboard, height: Number(e.target.value)})} required />
                        </div>
                        
                         {editingBillboard.type === BillboardType.Static ? (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Rate Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Side A Rate ($)" type="number" value={editingBillboard.sideARate || 0} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideARate: Number(e.target.value)})} />
                                    <MinimalInput label="Side B Rate ($)" type="number" value={editingBillboard.sideBRate || 0} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideBRate: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 italic">Availability is controlled automatically by Rental Agreements.</p>
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Digital Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Total Slots" type="number" value={editingBillboard.totalSlots || 10} onChange={(e: any) => setEditingBillboard({...editingBillboard, totalSlots: Number(e.target.value)})} />
                                    <MinimalInput label="Rate Per Slot ($)" type="number" value={editingBillboard.ratePerSlot || 0} onChange={(e: any) => setEditingBillboard({...editingBillboard, ratePerSlot: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Occupancy is calculated based on active contracts vs Total Slots.</p>
                            </div>
                        )}

                        <div className="group relative">
                            <textarea value={editingBillboard.notes} onChange={(e) => setEditingBillboard({...editingBillboard, notes: e.target.value})} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent h-20 resize-none"/>
                            <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">Internal Notes</label>
                        </div>
                         
                        <div className="space-y-4">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">Billboard Image</label>
                            <div className="flex items-center gap-4">
                                {editingBillboard.imageUrl && <img src={editingBillboard.imageUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />}
                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all"/>
                            </div>
                        </div>

                        {/* Analysis Section */}
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4 relative z-10">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-2"><Sparkles size={14}/> Analysis & Traffic</h4>
                                <button type="button" onClick={() => handleAutoAnalyze(true)} disabled={isAnalyzing} className="text-[10px] bg-white text-indigo-600 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider shadow-sm border border-indigo-100 hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50">
                                    {isAnalyzing ? <RefreshCw size={12} className="animate-spin"/> : <Sparkles size={12}/>} {isAnalyzing ? 'Analyzing...' : 'Auto-Generate'}
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                <div className="md:col-span-2">
                                    <MinimalInput label="Visibility Notes (AI)" value={editingBillboard.visibility} onChange={(e: any) => setEditingBillboard({...editingBillboard, visibility: e.target.value})} />
                                </div>
                                <div>
                                    <MinimalInput label="Est. Daily Traffic" type="number" value={editingBillboard.dailyTraffic} onChange={(e: any) => setEditingBillboard({...editingBillboard, dailyTraffic: Number(e.target.value)})} />
                                </div>
                            </div>
                        </div>
                        
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">
                            <Save size={18} /> Update Asset
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {billboardToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setBillboardToDelete(null)} />
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50">
                        <AlertTriangle className="text-red-500" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Billboard?</h3>
                    <p className="text-slate-500 mb-6 text-sm">
                        Are you sure you want to delete <span className="font-bold text-slate-700">{billboardToDelete.name}</span>? This action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setBillboardToDelete(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleConfirmDelete} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-500/30">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};