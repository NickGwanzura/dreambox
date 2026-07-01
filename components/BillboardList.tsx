import React, { useState, useEffect, useRef } from 'react';
import { Billboard, BillboardType, Client, Contract } from '../types';
import { getBillboards, addBillboard, updateBillboard, deleteBillboard, clients, ZIM_TOWNS, addClient, addContract, getClients, updateClient, getContracts, subscribe } from '../services/mockData';
import { analyzeBillboardLocation } from '../services/aiService';
import { geocodeLocation, GeocodeMatch } from '../services/geocodingService';
import { hasValidCoordinates, hasMissingCoordinates, isFallbackCoordinate, getTownCenter, formatCoordinate, getConfiguredTowns } from '../utils/coordinates';
import { MapPin, X, Edit2, Save, Plus, Image as ImageIcon, Map as MapIcon, Trash2, AlertTriangle, Share2, Eye, List as ListIcon, Search, Link2, Upload, Download, Layers, Users, Sparkles, RefreshCw, Car, ZoomIn, Maximize2, Hash, Zap, MousePointer2, FileText, Globe, FileDown } from 'lucide-react';
import { getCurrentUser } from '../services/authServiceSecure';
import { useToast } from './ToastProvider';
import { api } from '../services/apiClient';
import { canDelete } from '../utils/settingsAccess';
import { generateAvailabilitySheetPDF } from '../services/pdfGenerator';
import L from 'leaflet';
import { createGooglePin, createDotPin, googlePopup, PIN_RED, PIN_INDIGO, STREET_TILE, SATELLITE_TILE, SATELLITE_LABELS } from '../lib/mapIcons';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative pt-5">
    <input type={type} required={required} value={value as any} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 top-0 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative pt-5">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 top-0 text-xs text-slate-900 font-medium uppercase tracking-wide">{label}</label>
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

const getActiveBillboardContracts = (billboardId: string) => {
    const today = new Date();
    return getContracts().filter(c =>
        c.billboardId === billboardId &&
        String(c.status || '').toLowerCase() === 'active' &&
        new Date(c.startDate) <= today &&
        new Date(c.endDate) >= today
    );
};

const formatTraffic = (value?: number) => {
    if (!value) return '-';
    if (value < 1000) return value.toLocaleString();
    if (value < 10000) return `${(value / 1000).toFixed(1).replace('.0', '')}k`;
    return `${Math.round(value / 1000).toLocaleString()}k`;
};

const money = (value?: number) => `$${(value || 0).toLocaleString()}`;

const getBillboardAvailabilityDetails = (billboard: Billboard) => {
    const activeContracts = getActiveBillboardContracts(billboard.id);

    if (billboard.type === 'Static') {
        const sideABooked = activeContracts.some(c => c.side === 'A' || c.side === 'Both' || (c.details || '').includes('Side A'));
        const sideBBooked = activeContracts.some(c => c.side === 'B' || c.side === 'Both' || (c.details || '').includes('Side B'));
        const sideAStatus = billboard.sideAStatus || 'Available';
        const sideBStatus = billboard.sideBStatus || 'Available';
        const sideAOpen = sideAStatus === 'Available' && !sideABooked;
        const sideBOpen = sideBStatus === 'Available' && !sideBBooked;
        const openSides = [
            ...(sideAOpen ? [{ side: 'A', rate: billboard.sideARate || 0 }] : []),
            ...(sideBOpen ? [{ side: 'B', rate: billboard.sideBRate || 0 }] : [])
        ];
        const rates = openSides.map(s => s.rate).filter(rate => rate > 0);
        const minRate = rates.length ? Math.min(...rates) : 0;
        const maxRate = rates.length ? Math.max(...rates) : 0;
        const priceLabel = rates.length === 1
            ? `Side ${openSides[0].side} ${money(rates[0])}`
            : rates.length > 1 && minRate !== maxRate
                ? `${money(minRate)}-${money(maxRate)}`
                : minRate > 0
                    ? money(minRate)
                    : '';
        
        if (sideAOpen && sideBOpen) return { status: 'Open' as const, label: 'A+B Open', sublabel: 'Both sides available', priceLabel, sideAOpen, sideBOpen, openSlots: 2, totalSlots: 2 };
        if (sideAOpen || sideBOpen) return { status: 'Partial' as const, label: `Side ${sideAOpen ? 'A' : 'B'} Open`, sublabel: `${sideAOpen ? 'Side B' : 'Side A'} occupied`, priceLabel, sideAOpen, sideBOpen, openSlots: 1, totalSlots: 2 };
        if (sideAStatus === 'Maintenance' || sideBStatus === 'Maintenance') return { status: 'Booked' as const, label: 'Maintenance', sublabel: 'Unavailable', priceLabel, sideAOpen, sideBOpen, openSlots: 0, totalSlots: 2 };
        return { status: 'Booked' as const, label: 'Booked', sublabel: 'No sides open', priceLabel, sideAOpen, sideBOpen, openSlots: 0, totalSlots: 2 };
    }

    const totalSlots = Math.max(1, billboard.totalSlots || 1);
    const rentedSlots = Math.max(billboard.rentedSlots || 0, activeContracts.length);
    const openSlots = Math.max(0, totalSlots - rentedSlots);
    const status = openSlots <= 0 ? 'Booked' as const : 'Open' as const;
    return {
        status,
        label: openSlots > 0 ? `${openSlots}/${totalSlots} Slots Open` : 'Booked',
        sublabel: openSlots > 0 ? `${openSlots} available now` : 'No slots open',
        priceLabel: billboard.ratePerSlot ? `${money(billboard.ratePerSlot)}/slot` : '',
        sideAOpen: false,
        sideBOpen: false,
        openSlots,
        totalSlots
    };
}

export const BillboardList: React.FC = () => {
  const { showToast } = useToast();
  const canUserDelete = canDelete(getCurrentUser());
  const [billboards, setBillboards] = useState<Billboard[]>(getBillboards());
  const [filter, setFilter] = useState<'All' | 'Static' | 'LED'>('All');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<GeocodeMatch | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const [townOptions, setTownOptions] = useState<string[]>(getConfiguredTowns(ZIM_TOWNS));
  
  const [newBillboard, setNewBillboard] = useState<Partial<Billboard>>({
    name: '', location: '', town: 'Harare', type: BillboardType.Static, width: 0, height: 0,
    sideARate: 0, sideBRate: 0, ratePerSlot: 0, totalSlots: 10, rentedSlots: 0, imageUrl: '', visibility: '', dailyTraffic: 0,
    sideAStatus: 'Available', sideBStatus: 'Available',
    coordinates: { lat: 0, lng: 0 },
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
    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch = (b.name || '').toLowerCase().includes(lowerSearch) || 
                          (b.location || '').toLowerCase().includes(lowerSearch) ||
                          (b.town || '').toLowerCase().includes(lowerSearch);
    return matchesFilter && matchesSearch;
  });

  // Main Map View Logic
  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    try {
        const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([-17.824858, 31.053028], 13);
        mapRef.current = map;
        const tile = L.tileLayer(STREET_TILE, { attribution: '© CartoDB © OpenStreetMap', maxZoom: 19 }).addTo(map);
        tileLayerRef.current = tile;

        const validBoards = filteredBillboards.filter(b => hasValidCoordinates(b));
        validBoards.forEach(b => {
            const popup = isClientView
                ? googlePopup(b.name, `${b.location}, ${b.town}`)
                : googlePopup(b.name, `${b.location}, ${b.town}`, `${b.type} · ${b.width}×${b.height}m`);
            L.marker([b.coordinates.lat, b.coordinates.lng], { icon: createGooglePin(PIN_RED) })
                .addTo(map)
                .bindPopup(popup, { maxWidth: 280 });
        });

        if (validBoards.length > 0) {
            const bounds = L.latLngBounds(validBoards.map(b => [b.coordinates.lat, b.coordinates.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }

        if (showHeatmap) {
            const heatPoints = validBoards.map(b => ({ lat: b.coordinates.lat, lng: b.coordinates.lng, r: 200, color: 'blue' }));

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
  }, [viewMode, filter, isClientView, searchTerm, showHeatmap, billboards]); 

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
          const townCenter = getTownCenter(target.town);
          const hasValid = hasValidCoordinates(target as any);
          const initialLat = hasValid ? target.coordinates!.lat : townCenter.lat;
          const initialLng = hasValid ? target.coordinates!.lng : townCenter.lng;

          const map = L.map(pickerContainerRef.current, { zoomControl: true }).setView([initialLat, initialLng], hasValid ? 17 : 14);
          pickerMapRef.current = map;

          const streetLayer = L.tileLayer(STREET_TILE, { attribution: '© CartoDB', maxZoom: 19 });
          const satLayer    = L.tileLayer(SATELLITE_TILE, { attribution: '© Esri', maxZoom: 19 });
          const lblLayer    = L.tileLayer(SATELLITE_LABELS, { attribution: '', maxZoom: 19, opacity: 0.85 });
          streetLayer.addTo(map);

          // Satellite toggle button
          let sat = false;
          const toggleBtn = L.control({ position: 'topright' });
          toggleBtn.onAdd = () => {
              const btn = L.DomUtil.create('button');
              btn.innerHTML = '🛰 Satellite';
              btn.style.cssText = 'background:#fff;border:none;padding:5px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.3);color:#5f6368;font-family:Arial,sans-serif;';
              L.DomEvent.on(btn, 'click', () => {
                  sat = !sat;
                  if (sat) { map.removeLayer(streetLayer); satLayer.addTo(map); lblLayer.addTo(map); btn.innerHTML = '🗺 Street'; btn.style.color = '#1a73e8'; }
                  else { map.removeLayer(satLayer); map.removeLayer(lblLayer); streetLayer.addTo(map); btn.innerHTML = '🛰 Satellite'; btn.style.color = '#5f6368'; }
              });
              L.DomEvent.disableClickPropagation(btn);
              return btn;
          };
          toggleBtn.addTo(map);

          let marker = L.marker([initialLat, initialLng], { icon: createGooglePin(PIN_INDIGO), draggable: true }).addTo(map);

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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBillboard) return;
    try {
      await updateBillboard(editingBillboard);
      setEditingBillboard(null);
      setPickingLocation(false);
      showToast('Billboard saved', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Failed to save billboard';
      console.error('[handleSaveEdit] Save failed:', { billboard: editingBillboard.id, name: editingBillboard.name, error: msg, full: err });
      showToast(`Save failed: ${msg}`, 'error', 10000);
    }
  };
  const handleConfirmDelete = async () => {
      if (billboardToDelete) {
          try {
              await deleteBillboard(billboardToDelete.id);
              setBillboardToDelete(null);
          } catch (err: any) {
              alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
          }
      }
  };
  
  // ... (Other handlers unchanged)
  const handleAddBillboard = async (e: React.FormEvent) => {
    e.preventDefault();
    const billboard: Billboard = {
      id: (Date.now()).toString(), name: newBillboard.name!, location: newBillboard.location!, town: newBillboard.town || 'Harare', type: newBillboard.type!, width: newBillboard.width!, height: newBillboard.height!,
      sideARate: newBillboard.sideARate, sideBRate: newBillboard.sideBRate, ratePerSlot: newBillboard.ratePerSlot, totalSlots: newBillboard.totalSlots, rentedSlots: 0,
      sideAStatus: 'Available', sideBStatus: 'Available', imageUrl: newBillboard.imageUrl || '', visibility: newBillboard.visibility, dailyTraffic: newBillboard.dailyTraffic, coordinates: newBillboard.coordinates || { lat: 0, lng: 0 },
      notes: newBillboard.notes
    };
    try {
      await addBillboard(billboard);
    } catch (err: any) {
      alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
      return;
    }
    setIsAddModalOpen(false); setPickingLocation(false); setGeocodeResult(null); setGeocodeError(null);
    setNewBillboard({ name: '', location: '', town: 'Harare', type: BillboardType.Static, width: 0, height: 0, sideARate: 0, sideBRate: 0, ratePerSlot: 0, totalSlots: 10, rentedSlots: 0, imageUrl: '', visibility: '', dailyTraffic: 0, coordinates: { lat: 0, lng: 0 }, sideAStatus: 'Available', sideBStatus: 'Available', notes: '' });
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
        alert(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please use an image under ${MAX_MB} MB.`);
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64 = reader.result as string;
        // Show base64 preview immediately while upload is in progress
        if (isEdit) {
            setEditingBillboard(prev => prev ? { ...prev, imageUrl: base64 } : null);
        } else {
            setNewBillboard(prev => ({ ...prev, imageUrl: base64 }));
        }
        // Upload to R2 now — replace base64 preview with stable URL
        setIsUploadingImage(true);
        try {
            const result = await api.post<{ url: string }>('/api/upload-image', { dataUrl: base64, folder: 'billboards' });
            if (isEdit) {
                setEditingBillboard(prev => prev ? { ...prev, imageUrl: result.url } : null);
            } else {
                setNewBillboard(prev => ({ ...prev, imageUrl: result.url }));
            }
        } catch (err) {
            console.error('[handleImageUpload] R2 upload failed, using base64 fallback:', err);
            // Base64 preview stays in state; billboard handler will attempt upload as fallback
        } finally {
            setIsUploadingImage(false);
        }
    };
    reader.readAsDataURL(file);
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

  const handleGeocode = async (isEdit: boolean) => {
      const target = isEdit ? editingBillboard : newBillboard;
      if (!target?.location || !target?.town) {
          setGeocodeError('Please enter Location and Town first.');
          return;
      }
      setIsGeocoding(true);
      setGeocodeError(null);
      setGeocodeResult(null);
      try {
          const result = await geocodeLocation(target.location, target.town);
          if (result) {
              setGeocodeResult(result);
              if (isEdit && editingBillboard) {
                  setEditingBillboard({ ...editingBillboard, coordinates: { lat: result.lat, lng: result.lng } });
              } else {
                  setNewBillboard({ ...newBillboard, coordinates: { lat: result.lat, lng: result.lng } });
              }
          } else {
              setGeocodeError('No coordinates found. Try a more specific location or use the map picker.');
          }
      } catch (e: any) {
          setGeocodeError(e.message || 'Geocoding failed.');
      } finally {
          setIsGeocoding(false);
      }
  };

  const getClientName = (clientId?: string) => { if(!clientId) return 'Available'; return clients.find(c => c.id === clientId)?.companyName || 'Unknown'; };
  
  const shareBillboard = async (b: Billboard) => { 
      const slug = `${(b.name || 'billboard').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${b.id.slice(-8)}`;
      const url = `${window.location.origin}/billboard/${slug}`;
      try {
          await navigator.clipboard.writeText(url);
          alert("Public Share Link copied to clipboard!\nAnyone with this link can view this billboard details.");
      } catch {
          window.prompt("Copy this public share link:", url);
      }
  };

  const shareMap = async () => {
      const url = `${window.location.origin}${window.location.pathname}?public=true&type=map`;
      try {
          await navigator.clipboard.writeText(url);
          alert("Public Map Link copied to clipboard!\n\nThis link allows read-only access to your full inventory map.");
      } catch {
          window.prompt("Copy this public map link:", url);
      }
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
      reader.onload = async (event) => {
          const text = event.target?.result as string;
          const lines = text.split('\n').slice(1);
          let importedCount = 0;
          let contractsCreated = 0;

          for (const line of lines) {
              if (!line.trim()) continue;
              const cols = line.split(',').map(c => c.trim());
              if (cols.length < 4) continue;

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
                  coordinates: { lat: Number(lat) || 0, lng: Number(lng) || 0 },
                  sideAStatus: 'Available',
                  sideBStatus: 'Available',
                  visibility: 'Imported Data',
                  imageUrl: ''
              };
              try {
                  await addBillboard(newBoard);
                  importedCount++;
              } catch (err: any) {
                  alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
                  continue;
              }

              if (clientName && startDate && endDate) {
                  const currentClients = getClients();
                  let client = currentClients.find(c => String(c.companyName || '').toLowerCase() === String(clientName || '').toLowerCase());
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
                      try {
                          await addClient(newClient);
                          client = newClient;
                      } catch (err: any) {
                          alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
                          continue;
                      }
                  } else if (preferredBillingDay && client.billingDay !== preferredBillingDay) {
                      try {
                          await updateClient({ ...client, billingDay: preferredBillingDay });
                      } catch (err: any) {
                          alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
                      }
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
                      clientId: client!.id,
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

                  try {
                      await addContract(newContract);
                      contractsCreated++;
                  } catch (err: any) {
                      alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
                  }
              }
          }
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
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Inventory</h2><p className="text-slate-900 font-medium">Manage and monitor your digital and static assets</p></div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
             <div className="relative group w-full sm:w-72">
                <Search className="absolute left-4 top-3 text-slate-900 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search location or name..." className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-full bg-white/80 backdrop-blur-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm shadow-sm"/>
             </div>
             <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <div className="flex bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 p-1 shadow-sm">
                    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-full transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-900 hover:text-slate-900'}`} title="List View"><ListIcon size={18} /></button>
                    <button onClick={() => setViewMode('map')} className={`p-2.5 rounded-full transition-all ${viewMode === 'map' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-900 hover:text-slate-900'}`} title="Map View"><MapIcon size={18} /></button>
                </div>
                
                <div className="flex bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 p-1 shadow-sm items-center">
                    <button onClick={downloadTemplate} className="p-2.5 rounded-full text-slate-900 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Download CSV Template"><Download size={18}/></button>
                    <label className="p-2.5 rounded-full text-slate-900 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer" title="Import Billboards CSV">
                        <Upload size={18}/>
                        <input type="file" ref={importInputRef} accept=".csv" className="hidden" onChange={handleImportBillboards} />
                    </label>
                    <button onClick={handleExportBillboards} className="p-2.5 rounded-full text-slate-900 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Export Inventory to CSV"><FileText size={18}/></button>
                    <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
                    <button onClick={shareMap} className="p-2.5 rounded-full text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-all" title="Share Public Map Link"><Globe size={18}/></button>
                </div>

                <button onClick={() => generateAvailabilitySheetPDF(billboards)} className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:from-amber-600 hover:to-amber-700 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2" title="Premium PDF of unoccupied sites and prices"><FileDown size={18} /> Availability PDF</button>

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
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${showHeatmap ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white text-slate-900 hover:bg-slate-50'}`}
                     >
                         <Layers size={14} /> {showHeatmap ? 'Hide Traffic Heat' : 'Show Traffic Heat'}
                     </button>
                     <button 
                        onClick={shareMap} 
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                     >
                         <Globe size={14} /> Share Public Map
                     </button>
                 </div>
             </div>
        ) : (
            <div className="flex-1 overflow-y-auto pr-2 pb-20 space-y-4">
                {filteredBillboards.map((b, idx) => {
                    const availability = getBillboardAvailabilityDetails(b);
                    const status = availability.status;
                    const isAvailable = status === 'Open';
                    const isPartial = status === 'Partial';
                    const gradientClass = getPlaceholderGradient(b.id);
                    const hasImage = hasValidImage(b.imageUrl);

                    return (
                        <div key={b.id} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-xl transition-all group hover:-translate-y-1">
                            <div className="relative shrink-0">
                                <div className="absolute -top-2 -left-2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10 border border-white/20">#{idx + 1}</div>
                                <div
                                    className={`w-24 h-24 rounded-2xl overflow-hidden border border-slate-100 shadow-sm relative group-hover:scale-105 transition-transform cursor-zoom-in ${!hasImage ? gradientClass : ''}`}
                                    onClick={() => hasImage && setViewImage(b.imageUrl!)}
                                >
                                    <div className={`absolute inset-0 ${gradientClass} flex items-center justify-center text-white/30`}><ImageIcon size={28}/></div>
                                    {hasImage ? (
                                        <img
                                           src={b.imageUrl}
                                           alt={b.name}
                                           className="relative z-[1] w-full h-full object-cover"
                                           onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement?.classList.add(...gradientClass.split(' ')); }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <ImageIcon size={24} className="text-white/40" />
                                        </div>
                                    )}
                                    {/* Hover overlay - only on cards with images */}
                                    {hasImage && (
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center rounded-2xl">
                                            <ZoomIn size={20} className="text-white/0 group-hover:scale-100 group-hover:text-white transition-all duration-300" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <h4 className="font-bold text-slate-900 truncate text-lg tracking-tight group-hover:text-indigo-600 transition-colors" title={b.name}>{b.name}</h4>
                                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-widest border shrink-0 shadow-sm ${isAvailable ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : isPartial ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                        {availability.label}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate mb-3">
                                    <MapPin size={12} className="shrink-0 text-indigo-400"/> <span className="truncate">{b.location}, {b.town}</span>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-700 uppercase tracking-wide border border-slate-100"><Maximize2 size={11} className="text-slate-400"/> {b.width}×{b.height}m</span>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-700 uppercase tracking-wide border border-slate-100"><Car size={11} className="text-slate-400"/> {formatTraffic(b.dailyTraffic)} Views</span>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-700 uppercase tracking-wide border border-slate-100"><Layers size={11} className="text-slate-400"/> {b.type === BillboardType.LED ? `${availability.openSlots}/${availability.totalSlots} Slots` : `${availability.openSlots}/2 Sides`}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 sm:border-l sm:border-slate-100 sm:pl-6 pt-4 sm:pt-0 border-t border-slate-100 sm:border-t-0 mt-3 sm:mt-0 w-full sm:w-auto justify-between sm:justify-start">
                                <div className="flex flex-col items-end">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-1.5 ${b.type === BillboardType.LED ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{b.type}</span>
                                    {availability.priceLabel && <span className="text-sm font-extrabold text-slate-900">{availability.priceLabel}{b.type === BillboardType.Static && <span className="text-[10px] font-normal text-slate-500">/mo</span>}</span>}
                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {b.id.slice(-4)}</span>
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={() => setEditingBillboard(b)} className="p-2.5 text-slate-400 hover:text-indigo-600 bg-transparent hover:bg-indigo-50 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md" title="Edit"><Edit2 size={15}/></button>
                                    <button onClick={() => shareBillboard(b)} className="p-2.5 text-slate-400 hover:text-indigo-600 bg-transparent hover:bg-indigo-50 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md" title="Share"><Share2 size={15}/></button>
                                    {canUserDelete && (<button onClick={() => setBillboardToDelete(b)} className="p-2.5 text-slate-400 hover:text-red-600 bg-transparent hover:bg-red-50 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md" title="Delete"><Trash2 size={15}/></button>)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      {/* ... (Image Viewer & Add Modal unchanged) ... */}
      {viewImage && (
          <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewImage(null)}>
              <div className="relative max-w-7xl max-h-full w-full h-full flex flex-col items-center justify-center">
                  <img src={viewImage} className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}/>
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

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Add New Billboard</h3>
                        <p className="text-xs text-slate-900 mt-0.5">Register a new asset in your inventory</p>
                    </div>
                    <button onClick={() => { setIsAddModalOpen(false); setPickingLocation(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900"/></button>
                </div>
                    <form onSubmit={handleAddBillboard} className="p-8 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Name" value={newBillboard.name} onChange={(e: any) => setNewBillboard({...newBillboard, name: e.target.value})} required />
                            <MinimalSelect label="Type" value={newBillboard.type} onChange={(e: any) => setNewBillboard({...newBillboard, type: e.target.value})} options={[{value: 'Static', label: 'Static Billboard'},{value: 'LED', label: 'Digital LED Screen'}]} />
                        </div>
                        <MinimalInput label="Location" value={newBillboard.location} onChange={(e: any) => setNewBillboard({...newBillboard, location: e.target.value})} required />
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalSelect label="Town" value={newBillboard.town} onChange={(e: any) => setNewBillboard({...newBillboard, town: e.target.value})} options={townOptions.map(t => ({value: t, label: t}))} />
                            <div className="space-y-2">
                                <div className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <div className="flex gap-2">
                                            <MinimalInput label="Lat" type="number" value={newBillboard.coordinates?.lat} onChange={(e: any) => setNewBillboard({...newBillboard, coordinates: {...newBillboard.coordinates!, lat: Number(e.target.value)}})} />
                                            <MinimalInput label="Lng" type="number" value={newBillboard.coordinates?.lng} onChange={(e: any) => setNewBillboard({...newBillboard, coordinates: {...newBillboard.coordinates!, lng: Number(e.target.value)}})} />
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setPickingLocation(!pickingLocation)} className={`mb-2 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border ${pickingLocation ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:shadow-sm'}`} title="Set location on map">
                                        <MapIcon size={13}/> {pickingLocation ? 'Close Map' : 'Set on Map'}
                                    </button>
                                    <button type="button" onClick={() => handleGeocode(false)} disabled={isGeocoding || !newBillboard.location || !newBillboard.town} className="mb-2 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1" title="Geocode Address">
                                        {isGeocoding ? <RefreshCw size={14} className="animate-spin"/> : <MapPin size={14}/>} {isGeocoding ? 'Finding...' : 'Find'}
                                    </button>
                                </div>
                                {hasMissingCoordinates(newBillboard as any) && (
                                    <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12}/> Coordinates missing. Click Find or use the map picker.</p>
                                )}
                                {!hasMissingCoordinates(newBillboard as any) && isFallbackCoordinate(newBillboard.coordinates!.lat, newBillboard.coordinates!.lng) && (
                                    <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12}/> This is the default location. Please verify or geocode.</p>
                                )}
                                {geocodeResult && (
                                    <p className="text-[11px] text-emerald-600 flex items-start gap-1"><MapPin size={12} className="shrink-0 mt-0.5"/> Found: {geocodeResult.displayName} ({formatCoordinate(geocodeResult.lat, geocodeResult.lng)})</p>
                                )}
                                {geocodeError && (
                                    <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> {geocodeError}</p>
                                )}
                            </div>
                        </div>
                        {pickingLocation && (
                            <div className="h-80 w-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative animate-fade-in">
                                <div ref={pickerContainerRef} className="w-full h-full z-0"></div>
                                <div className="absolute bottom-2 left-2 z-[400] bg-white/95 px-3 py-1.5 text-[10px] rounded-full shadow-md font-semibold text-slate-700 flex items-center gap-1.5 border border-slate-100"><MapPin size={10} className="text-red-500"/> Click map or drag pin to set location</div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Width (m)" type="number" value={newBillboard.width} onChange={(e: any) => setNewBillboard({...newBillboard, width: Number(e.target.value)})} required />
                            <MinimalInput label="Height (m)" type="number" value={newBillboard.height} onChange={(e: any) => setNewBillboard({...newBillboard, height: Number(e.target.value)})} required />
                        </div>
                        
                        {/* Dynamic Rates based on Type */}
                        {newBillboard.type === BillboardType.Static ? (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Rate Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Side A Rate ($)" type="number" value={newBillboard.sideARate} onChange={(e: any) => setNewBillboard({...newBillboard, sideARate: Number(e.target.value)})} />
                                    <MinimalInput label="Side B Rate ($)" type="number" value={newBillboard.sideBRate} onChange={(e: any) => setNewBillboard({...newBillboard, sideBRate: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-900 mt-2 italic">Availability is controlled automatically by Rental Agreements.</p>
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Digital Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Total Slots" type="number" value={newBillboard.totalSlots} onChange={(e: any) => setNewBillboard({...newBillboard, totalSlots: Number(e.target.value)})} />
                                    <MinimalInput label="Rate Per Slot ($)" type="number" value={newBillboard.ratePerSlot} onChange={(e: any) => setNewBillboard({...newBillboard, ratePerSlot: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-900 mt-1">Occupancy is calculated based on active contracts vs Total Slots.</p>
                            </div>
                        )}

                        <div className="group relative">
                            <textarea value={newBillboard.notes} onChange={(e) => setNewBillboard({...newBillboard, notes: e.target.value})} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent h-20 resize-none"/>
                            <label className="absolute left-0 top-0 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-2.5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">Internal Notes (Optional)</label>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wide">Billboard Image</label>
                            <div className="flex items-center gap-4">
                                {isUploadingImage ? (
                                    <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                                        <RefreshCw size={18} className="animate-spin text-indigo-500" />
                                    </div>
                                ) : newBillboard.imageUrl ? (
                                    <img src={newBillboard.imageUrl} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0" />
                                ) : null}
                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} disabled={isUploadingImage} className="block w-full text-sm text-slate-900 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all disabled:opacity-50"/>
                                {isUploadingImage && <span className="text-xs text-indigo-500 font-medium whitespace-nowrap">Uploading…</span>}
                            </div>
                        </div>

                        {/* Analysis Section */}
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4 relative z-10">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-2"><Sparkles size={14}/> Analysis & Traffic</h4>
                                <button type="button" onClick={() => handleAutoAnalyze(false)} disabled={isAnalyzing} className="text-[10px] bg-white text-indigo-600 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider shadow-sm border border-indigo-100 hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50">
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

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => { setIsAddModalOpen(false); setPickingLocation(false); }} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">Cancel</button>
                            <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"><Save size={14} /> Save Asset</button>
                        </div>
                    </form>
            </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBillboard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Edit Billboard</h3>
                        <p className="text-xs text-slate-900 mt-0.5">{editingBillboard.name} &bull; {editingBillboard.location}, {editingBillboard.town}</p>
                    </div>
                    <button onClick={() => { setEditingBillboard(null); setPickingLocation(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-900"/></button>
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
                            <MinimalSelect label="Town" value={editingBillboard.town} onChange={(e: any) => setEditingBillboard({...editingBillboard, town: e.target.value})} options={townOptions.map(t => ({value: t, label: t}))} />
                        </div>

                        <div className="space-y-2">
                            <div className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <div className="flex gap-2">
                                        <MinimalInput label="Lat" type="number" value={editingBillboard.coordinates?.lat} onChange={(e: any) => setEditingBillboard({...editingBillboard, coordinates: {...editingBillboard.coordinates!, lat: Number(e.target.value)}})} />
                                        <MinimalInput label="Lng" type="number" value={editingBillboard.coordinates?.lng} onChange={(e: any) => setEditingBillboard({...editingBillboard, coordinates: {...editingBillboard.coordinates!, lng: Number(e.target.value)}})} />
                                    </div>
                                </div>
                                <button type="button" onClick={() => setPickingLocation(!pickingLocation)} className={`mb-2 p-2 rounded-xl transition-colors ${pickingLocation ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`} title="Pick on Map">
                                    <MousePointer2 size={18}/>
                                </button>
                                <button type="button" onClick={() => handleGeocode(true)} disabled={isGeocoding || !editingBillboard.location || !editingBillboard.town} className="mb-2 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1" title="Geocode Address">
                                    {isGeocoding ? <RefreshCw size={14} className="animate-spin"/> : <MapPin size={14}/>} {isGeocoding ? 'Finding...' : 'Find'}
                                </button>
                            </div>
                            {hasMissingCoordinates(editingBillboard) && (
                                <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12}/> Coordinates missing. Click Find or use the map picker.</p>
                            )}
                            {!hasMissingCoordinates(editingBillboard) && isFallbackCoordinate(editingBillboard.coordinates.lat, editingBillboard.coordinates.lng) && (
                                <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12}/> This is the default location. Please verify or geocode.</p>
                            )}
                            {geocodeResult && (
                                <p className="text-[11px] text-emerald-600 flex items-start gap-1"><MapPin size={12} className="shrink-0 mt-0.5"/> Found: {geocodeResult.displayName} ({formatCoordinate(geocodeResult.lat, geocodeResult.lng)})</p>
                            )}
                            {geocodeError && (
                                <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> {geocodeError}</p>
                            )}
                        </div>

                        {pickingLocation && (
                            <div className="h-80 w-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative animate-fade-in">
                                <div ref={pickerContainerRef} className="w-full h-full z-0"></div>
                                <div className="absolute bottom-2 left-2 z-[400] bg-white/95 px-3 py-1.5 text-[10px] rounded-full shadow-md font-semibold text-slate-700 flex items-center gap-1.5 border border-slate-100"><MapPin size={10} className="text-red-500"/> Click map or drag pin to set location</div>
                            </div>
                        )}

                        {/* NEW: Dimensions Inputs */}
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Width (m)" type="number" value={editingBillboard.width} onChange={(e: any) => setEditingBillboard({...editingBillboard, width: Number(e.target.value)})} required />
                            <MinimalInput label="Height (m)" type="number" value={editingBillboard.height} onChange={(e: any) => setEditingBillboard({...editingBillboard, height: Number(e.target.value)})} required />
                        </div>
                        
                         {editingBillboard.type === BillboardType.Static ? (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Rate Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Side A Rate ($)" type="number" value={editingBillboard.sideARate || 0} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideARate: Number(e.target.value)})} />
                                    <MinimalInput label="Side B Rate ($)" type="number" value={editingBillboard.sideBRate || 0} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideBRate: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-900 mt-2 italic">Availability is controlled automatically by Rental Agreements.</p>
                            </div>
                        ) : (
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Digital Configuration</h4>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <MinimalInput label="Total Slots" type="number" value={editingBillboard.totalSlots || 10} onChange={(e: any) => setEditingBillboard({...editingBillboard, totalSlots: Number(e.target.value)})} />
                                    <MinimalInput label="Rate Per Slot ($)" type="number" value={editingBillboard.ratePerSlot || 0} onChange={(e: any) => setEditingBillboard({...editingBillboard, ratePerSlot: Number(e.target.value)})} />
                                </div>
                                <p className="text-[10px] text-slate-900 mt-1">Occupancy is calculated based on active contracts vs Total Slots.</p>
                            </div>
                        )}

                        <div className="group relative">
                            <textarea value={editingBillboard.notes} onChange={(e) => setEditingBillboard({...editingBillboard, notes: e.target.value})} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent h-20 resize-none"/>
                            <label className="absolute left-0 top-0 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-2.5 peer-focus:top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">Internal Notes</label>
                        </div>
                         
                        <div className="space-y-4">
                            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wide">Billboard Image</label>
                            <div className="flex items-center gap-4">
                                {isUploadingImage ? (
                                    <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                                        <RefreshCw size={18} className="animate-spin text-indigo-500" />
                                    </div>
                                ) : editingBillboard.imageUrl ? (
                                    <img src={editingBillboard.imageUrl} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0" />
                                ) : null}
                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} disabled={isUploadingImage} className="block w-full text-sm text-slate-900 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all disabled:opacity-50"/>
                                {isUploadingImage && <span className="text-xs text-indigo-500 font-medium whitespace-nowrap">Uploading…</span>}
                            </div>
                        </div>

                        {/* Analysis Section */}
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100 relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4 relative z-10">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-2"><Sparkles size={14}/> Analysis & Traffic</h4>
                                <button type="button" onClick={() => handleAutoAnalyze(true)} disabled={isAnalyzing} className="text-[10px] bg-white text-indigo-600 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider shadow-sm border border-indigo-100 hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50">
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
                        
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => { setEditingBillboard(null); setPickingLocation(false); }} className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">Cancel</button>
                            <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"><Save size={14} /> Update Asset</button>
                        </div>
                    </form>
            </div>
        </div>
      )}

      {/* Delete Billboard Confirmation */}
      {billboardToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-sm w-full border border-white/20">
                {/* Header */}
                <div className="p-6 border-b border-red-100 bg-red-50 rounded-t-3xl flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-red-200">
                        <Trash2 className="text-red-600" size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-red-900">Delete Billboard?</h3>
                        <p className="text-xs text-red-500 mt-0.5 font-medium">This action cannot be undone.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {/* Entity being deleted */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Billboard Being Deleted</p>
                        <p className="font-bold text-slate-900">{billboardToDelete.name}</p>
                        <p className="text-sm text-slate-900 flex items-center gap-2"><MapPin size={13} className="text-slate-900 shrink-0" /> {billboardToDelete.location}, {billboardToDelete.town}</p>
                        <p className="text-xs text-slate-900">{billboardToDelete.type} &bull; {billboardToDelete.width}×{billboardToDelete.height}m</p>
                        <p className="text-xs text-slate-900 font-mono mt-1">ID: {billboardToDelete.id}</p>
                    </div>
                    {/* Cascading impact warning */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 font-medium">Any active rental contracts referencing this billboard will be orphaned. The asset will be permanently removed from inventory.</p>
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button onClick={() => setBillboardToDelete(null)} className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5">Keep Billboard</button>
                        <button onClick={handleConfirmDelete} className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 shadow-lg shadow-red-600/20">Delete Permanently</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
