import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { getBillboards, getCompanyLogo, getContracts } from '../services/mockData';
import { Billboard, Contract } from '../types';
import { estimateDailyViews } from '../services/aiService';
import L from 'leaflet';
import { MapPin, Maximize2, Car, Layers, Zap, X, ExternalLink, DollarSign, CheckCircle, XCircle, Clock, Phone, Mail, AlertTriangle, Search, Filter, ImageIcon } from 'lucide-react';

const toSlug = (name: string): string =>
    name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const billboardLink = (b: Billboard): string => `/billboard/${toSlug(b.name)}-${b.id.slice(-8)}`;

const fetchPublicBillboards = async (): Promise<Billboard[] | null> => {
    try {
        const res = await fetch('/api/public-billboards');
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? data : null;
    } catch {
        return null;
    }
};

interface PublicViewProps {
    type: 'billboard' | 'map';
    billboardId?: string;
}

// Zimbabwe approximate bounding box
const ZIM_BOUNDS = L.latLngBounds(
    L.latLng(-22.4, 25.2),  // SW corner
    L.latLng(-15.6, 33.1)   // NE corner
);

const ZIM_DEFAULT_CENTER: [number, number] = [-19.0, 29.9];

const formatCompactNumber = (n: number): string => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
    return n.toLocaleString();
};

export const PublicView: React.FC<PublicViewProps> = ({ type, billboardId }) => {
    const [billboard, setBillboard] = useState<Billboard | null>(null);
    const [allBillboards, setAllBillboards] = useState<Billboard[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const logo = getCompanyLogo();

    // Map view state
    const [searchQuery, setSearchQuery] = useState('');
    const [townFilter, setTownFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [viewEstimates, setViewEstimates] = useState<Record<string, { dailyTraffic: number; description: string }>>({});
    const [estimating, setEstimating] = useState<Set<string>>(new Set());
    const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

    // Towns list for filter
    const towns = useMemo(() => {
        const unique = new Set(allBillboards.map(b => b.town).filter(Boolean));
        return Array.from(unique).sort();
    }, [allBillboards]);

    // Valid coordinates check: non-null, non-zero lat/lng within Zimbabwe range
    const hasValidCoordinates = useCallback((b: Billboard): boolean => {
        return !!(
            b.coordinates &&
            b.coordinates.lat !== 0 &&
            b.coordinates.lng !== 0
        );
    }, []);

    // Filtered billboards for map sidebar
    const filteredBillboards = useMemo(() => {
        let result = [...allBillboards];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(b =>
                b.name.toLowerCase().includes(q) ||
                b.location.toLowerCase().includes(q) ||
                b.town.toLowerCase().includes(q)
            );
        }
        if (townFilter !== 'all') {
            result = result.filter(b => b.town === townFilter);
        }
        if (typeFilter !== 'all') {
            result = result.filter(b => b.type === typeFilter);
        }
        return result;
    }, [allBillboards, searchQuery, townFilter, typeFilter]);

    const mappedBillboardsCount = useMemo(
        () => filteredBillboards.filter(b => hasValidCoordinates(b)).length,
        [filteredBillboards, hasValidCoordinates]
    );

    // Fetch Groq estimate for a billboard
    const fetchViewEstimate = useCallback(async (board: Billboard) => {
        if (estimating.has(board.id) || viewEstimates[board.id]) return;
        setEstimating(prev => new Set(prev).add(board.id));
        try {
            const result = await estimateDailyViews(board);
            setViewEstimates(prev => ({ ...prev, [board.id]: result }));
        } finally {
            setEstimating(prev => {
                const next = new Set(prev);
                next.delete(board.id);
                return next;
            });
        }
    }, [estimating, viewEstimates]);

    // Pre-fetch estimates for billboards without dailyTraffic on mount
    useEffect(() => {
        const boardsWithoutTraffic = allBillboards.filter(b => !b.dailyTraffic);
        boardsWithoutTraffic.forEach(b => fetchViewEstimate(b));
    }, [allBillboards.length]);

    useEffect(() => {
        let cancelled = false;

        const loadBoards = async () => {
            const localBoards = getBillboards();
            if (!cancelled) {
                setAllBillboards(localBoards);
                setContracts(getContracts());
                if (type === 'billboard' && billboardId) {
                    const bySlug = localBoards.find(b => billboardLink(b).endsWith('/' + billboardId) || b.id === billboardId);
                    const byId = localBoards.find(b => b.id === billboardId);
                    setBillboard(bySlug || byId || null);
                }
            }

            const publicBoards = await fetchPublicBillboards();
            if (cancelled || !publicBoards?.length) return;

            setAllBillboards(publicBoards);
            if (type === 'billboard' && billboardId) {
                const bySlug = publicBoards.find(b => billboardLink(b).endsWith('/' + billboardId) || b.id === billboardId);
                const byId = publicBoards.find(b => b.id === billboardId);
                setBillboard(bySlug || byId || null);
            }
        };

        loadBoards();
        return () => { cancelled = true; };
    }, [type, billboardId]);

    useEffect(() => {
        const boards = allBillboards;
        setContracts(getContracts());
        if (type === 'billboard' && billboardId) {
            // Try to find by slug first (matches at end of slugged ID), then by exact ID
            const bySlug = boards.find(b => billboardLink(b).endsWith('/' + billboardId) || b.id === billboardId);
            const byId = boards.find(b => b.id === billboardId);
            setBillboard(bySlug || byId || null);
        }
    }, [allBillboards, type, billboardId]);

    const otherBillboards = useMemo(
        () => allBillboards.filter(b => b.id !== billboard?.id && hasValidCoordinates(b)),
        [allBillboards, billboard?.id, hasValidCoordinates]
    );

    // Focus map on a specific billboard
    const focusMapOnBillboard = useCallback((boardId: string) => {
        const board = allBillboards.find(b => b.id === boardId);
        if (board && hasValidCoordinates(board) && mapRef.current) {
            mapRef.current.setView([board.coordinates!.lat, board.coordinates!.lng], 14, { animate: true });
            setSelectedBoardId(boardId);
        }
    }, [allBillboards, hasValidCoordinates]);

    // Get effective daily views (data or AI estimate)
    const getEffectiveViews = useCallback((board: Billboard): number => {
        if (board.dailyTraffic) return board.dailyTraffic;
        const estimate = viewEstimates[board.id];
        return estimate?.dailyTraffic || board.dailyTraffic || 0;
    }, [viewEstimates]);

    useEffect(() => {
        // Initialize Map
        if (!mapContainerRef.current) return;
        
        // If map doesn't exist, create it
        if (!mapRef.current) {
            const map = L.map(mapContainerRef.current, {
                maxBounds: ZIM_BOUNDS,
                maxBoundsViscosity: 1.0,
                minZoom: 6,
            }).setView(ZIM_DEFAULT_CENTER, 7);
            
            mapRef.current = map;
            
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
                attribution: 'OpenStreetMap',
                noWrap: true,
                bounds: ZIM_BOUNDS,
            }).addTo(map);

            // Add Zimbabwe outline overlay hint
            L.rectangle(ZIM_BOUNDS, {
                color: '#4f46e5',
                weight: 2,
                fill: false,
                dashArray: '5, 10',
                opacity: 0.3,
            }).addTo(map);
        }

        const map = mapRef.current;
        const DefaultIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        });
        const FeaturedIcon = L.divIcon({
            className: 'dreambox-featured-marker',
            html: `<div style="width:22px;height:22px;border-radius:50%;background:#4f46e5;border:3px solid #fff;box-shadow:0 0 0 3px rgba(79,70,229,0.35),0 4px 10px rgba(15,23,42,0.35);"></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            popupAnchor: [0, -12]
        });
        const OtherIcon = L.divIcon({
            className: 'dreambox-other-marker',
            html: `<div style="width:12px;height:12px;border-radius:50%;background:#94a3b8;border:2px solid #fff;box-shadow:0 2px 4px rgba(15,23,42,0.25);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            popupAnchor: [0, -8]
        });
        const SelectedIcon = L.divIcon({
            className: 'dreambox-selected-marker',
            html: `<div style="width:28px;height:28px;border-radius:50%;background:#059669;border:3px solid #fff;box-shadow:0 0 0 4px rgba(5,150,105,0.35),0 4px 14px rgba(15,23,42,0.4);"></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -16]
        });

        const renderOtherPopup = (b: Billboard) => `
            <div style="min-width:170px;">
                <strong>${b.name}</strong><br/>
                <span style="font-size:10px; color:#666;">${b.type} • ${b.width}x${b.height}m</span><br/>
                <span style="font-size:10px; color:#666;">${b.location}, ${b.town}</span><br/>
                <span style="font-size:10px; color:#666;">Views: ${formatCompactNumber(getEffectiveViews(b))}/day</span><br/>
                <a href="${billboardLink(b)}" style="color:#6366f1; font-size:10px; text-decoration:none; font-weight:bold;">View Details &rarr;</a>
            </div>
        `;

        // Clear existing layers to prevent duplicates on re-render
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        const boards = type === 'map' ? filteredBillboards.filter(b => hasValidCoordinates(b)) : allBillboards;

        if (type === 'billboard' && billboard && hasValidCoordinates(billboard)) {
            // Plot every other location as a muted secondary marker
            boards.forEach(b => {
                if (b.id === billboard.id || !hasValidCoordinates(b)) return;
                L.marker([b.coordinates.lat, b.coordinates.lng], { icon: OtherIcon, zIndexOffset: 0 })
                    .addTo(map)
                    .bindPopup(renderOtherPopup(b));
            });

            const { lat, lng } = billboard.coordinates;
            map.setView([lat, lng], 14);

            L.marker([lat, lng], { icon: FeaturedIcon, zIndexOffset: 1000 })
                .addTo(map)
                .bindPopup(`<b>${billboard.name}</b><br>${billboard.location}`)
                .openPopup();
        } else if (type === 'map') {
            if (boards.length > 0) {
                const validBoards = boards.filter(b => hasValidCoordinates(b));
                if (validBoards.length > 0) {
                    const bounds = L.latLngBounds(
                        validBoards.map(b => [b.coordinates!.lat, b.coordinates!.lng])
                    );
                    map.fitBounds(bounds, { padding: [50, 50] });
                    // Don't zoom out past Zimbabwe
                    if (map.getZoom() > 12) map.setZoom(12);
                }
            }

            boards.forEach(b => {
                if (hasValidCoordinates(b)) {
                    const isSelected = b.id === selectedBoardId;
                    const icon = isSelected ? SelectedIcon : DefaultIcon;
                    const zIndex = isSelected ? 1000 : 0;
                    L.marker([b.coordinates.lat, b.coordinates.lng], { icon, zIndexOffset: zIndex })
                        .addTo(map)
                        .bindPopup(renderOtherPopup(b));
                }
            });
        }

        map.invalidateSize();

    }, [billboard, type, filteredBillboards, allBillboards, selectedBoardId, viewEstimates, hasValidCoordinates]);

    if (type === 'billboard' && !billboard) {
        return (
            <div className="h-screen flex flex-col items-center justify-center text-slate-900 bg-slate-50">
                <MapPin size={48} className="mb-4 text-slate-300"/>
                <h2 className="text-xl font-bold text-slate-800">Billboard Not Found</h2>
                <p className="text-sm">The requested billboard ID is invalid or does not exist.</p>
                <a href="/locations" className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-slate-800 transition-all">View Full Map</a>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Public Header */}
            <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    {logo ? <img src={logo} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100 p-1"/> : <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">D</div>}
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 leading-tight">Dreambox Locations</h1>
                        <p className="text-xs text-slate-900">Public Asset Viewer</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    {type === 'billboard' && (
                        <a href="/locations" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors">
                            <Layers size={14}/> View Full Map
                        </a>
                    )}
                    <a href="/login" className="px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2">
                        CRM Login <ExternalLink size={12} />
                    </a>
                </div>
            </div>

            <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
                
                {/* Single Billboard View */}
                {type === 'billboard' && billboard && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                        {/* Left: Image & Stats */}
                        <div className="space-y-6">
                            <div className="rounded-3xl overflow-hidden shadow-2xl bg-slate-900 relative group h-72 sm:h-96 border border-slate-200">
                                {billboard.imageUrl ? (
                                    <img src={billboard.imageUrl} className="w-full h-full object-cover" alt={billboard.name} />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-white/30 gap-3">
                                        <div className="p-4 rounded-full bg-white/5"><ImageIcon size={40}/></div>
                                        <span className="text-xs uppercase tracking-widest font-bold">No Image Available</span>
                                        <span className="text-[10px] text-white/20 px-4 text-center max-w-xs leading-relaxed">
                                            Billboard images are coming soon. Check back for a visual preview of this location.
                                        </span>
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 shadow-lg">
                                    {billboard.type}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
                                    <div className="text-indigo-500 mb-2 flex justify-center"><Maximize2 size={24}/></div>
                                    <div className="font-black text-slate-800 text-lg">{billboard.width}x{billboard.height}m</div>
                                    <div className="text-[10px] text-slate-900 uppercase font-bold tracking-wider">Dimensions</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
                                    <div className="text-indigo-500 mb-2 flex justify-center"><Car size={24}/></div>
                                    <div className="font-black text-slate-800 text-lg">
                                        {billboard.dailyTraffic 
                                            ? billboard.dailyTraffic.toLocaleString() 
                                            : viewEstimates[billboard.id]
                                                ? viewEstimates[billboard.id].dailyTraffic.toLocaleString() + '*'
                                                : estimating.has(billboard.id)
                                                    ? '...'
                                                    : '-'
                                        }
                                    </div>
                                    <div className="text-[10px] text-slate-900 uppercase font-bold tracking-wider">
                                        {billboard.dailyTraffic 
                                            ? 'Daily Views'
                                            : viewEstimates[billboard.id]
                                                ? 'Est. Daily Views*'
                                                : 'Daily Views'
                                        }
                                    </div>
                                    {viewEstimates[billboard.id] && !billboard.dailyTraffic && (
                                        <div className="text-[8px] text-slate-900 mt-1 italic px-2 leading-tight">
                                            {viewEstimates[billboard.id].description}
                                        </div>
                                    )}
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
                                    <div className="text-indigo-500 mb-2 flex justify-center"><Layers size={24}/></div>
                                    <div className="font-black text-slate-800 text-lg">{billboard.type === 'Static' ? '2 Sides' : `${billboard.totalSlots} Slots`}</div>
                                    <div className="text-[10px] text-slate-900 uppercase font-bold tracking-wider">Configuration</div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Info, Pricing & Map */}
                        <div className="space-y-6 flex flex-col h-full">
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                                <h1 className="text-3xl font-black text-slate-900 mb-2 leading-tight">{billboard.name}</h1>
                                <div className="flex items-center gap-2 text-slate-900 font-medium mb-6">
                                    <MapPin size={18} className="text-indigo-500 fill-indigo-50"/> {billboard.location}, {billboard.town}
                                </div>
                                <div className="prose prose-slate text-sm text-slate-900 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <p>{billboard.visibility || "Premium advertising space located in a high-traffic area, offering excellent visibility for brands seeking maximum exposure."}</p>
                                </div>
                            </div>

                            {/* Pricing Card */}
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                                <div className="flex items-center gap-2 mb-4">
                                    <DollarSign size={18} className="text-emerald-600" />
                                    <h2 className="text-lg font-black text-slate-900">Pricing & Availability</h2>
                                </div>
                                {billboard.type === 'Static' ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full ${billboard.sideAStatus === 'Available' ? 'bg-emerald-500' : billboard.sideAStatus === 'Rented' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                <span className="font-bold text-slate-700 text-sm">Side A</span>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${billboard.sideAStatus === 'Available' ? 'bg-emerald-50 text-emerald-700' : billboard.sideAStatus === 'Rented' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                                                    {billboard.sideAStatus || 'Unknown'}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-black text-slate-900">${(billboard.sideARate || 0).toLocaleString()}<span className="text-xs text-slate-900 font-normal">/mo</span></div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full ${billboard.sideBStatus === 'Available' ? 'bg-emerald-500' : billboard.sideBStatus === 'Rented' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                <span className="font-bold text-slate-700 text-sm">Side B</span>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${billboard.sideBStatus === 'Available' ? 'bg-emerald-50 text-emerald-700' : billboard.sideBStatus === 'Rented' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                                                    {billboard.sideBStatus || 'Unknown'}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-black text-slate-900">${(billboard.sideBRate || 0).toLocaleString()}<span className="text-xs text-slate-900 font-normal">/mo</span></div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <Zap size={16} className="text-amber-500" />
                                                <span className="font-bold text-slate-700 text-sm">Rate per Slot</span>
                                            </div>
                                            <div className="font-black text-slate-900">${(billboard.ratePerSlot || 0).toLocaleString()}<span className="text-xs text-slate-900 font-normal">/mo</span></div>
                                        </div>
                                        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <Layers size={16} className="text-indigo-500" />
                                                <span className="font-bold text-slate-700 text-sm">Available Slots</span>
                                            </div>
                                            <div className="font-black text-slate-900">{Math.max(0, (billboard.totalSlots || 0) - (billboard.rentedSlots || 0))}<span className="text-xs text-slate-900 font-normal"> / {billboard.totalSlots || 0}</span></div>
                                        </div>
                                    </div>
                                )}
                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-900">
                                    {billboard.type === 'Static' && (billboard.sideAStatus === 'Available' || billboard.sideBStatus === 'Available') ? (
                                        <span className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle size={12} /> Space available — inquire today</span>
                                    ) : billboard.type === 'LED' && (billboard.rentedSlots || 0) < (billboard.totalSlots || 0) ? (
                                        <span className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle size={12} /> Slots available — inquire today</span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-amber-600 font-bold"><AlertTriangle size={12} /> Currently fully occupied — contact for waitlist</span>
                                    )}
                                </div>
                            </div>

                            {/* Monthly Cost Estimate Card */}
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                                <div className="flex items-center gap-2 mb-4">
                                    <Clock size={18} className="text-indigo-500" />
                                    <h2 className="text-lg font-black text-slate-900">What&rsquo;s Included</h2>
                                </div>
                                <ul className="space-y-2.5 text-sm">
                                    <li className="flex items-start gap-3 text-slate-900">
                                        <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong className="text-slate-800">Prime Placement</strong> — High-visibility location in {billboard.town} with excellent daily traffic exposure</span>
                                    </li>
                                    <li className="flex items-start gap-3 text-slate-900">
                                        <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong className="text-slate-800">Professional Printing</strong> — High-quality vinyl or digital print production included in setup</span>
                                    </li>
                                    <li className="flex items-start gap-3 text-slate-900">
                                        <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong className="text-slate-800">Installation & Maintenance</strong> — Full rigging, installation, and ongoing structural maintenance</span>
                                    </li>
                                    <li className="flex items-start gap-3 text-slate-900">
                                        <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong className="text-slate-800">Illumination</strong> — Nightly lighting for 24/7 visibility (where applicable)</span>
                                    </li>
                                    <li className="flex items-start gap-3 text-slate-900">
                                        <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <span><strong className="text-slate-800">Traffic Data</strong> — Verified daily view counts and monthly impression reports</span>
                                    </li>
                                </ul>
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <p className="text-xs text-slate-900 leading-relaxed">
                                        <strong className="text-slate-900">Note:</strong> Actual campaign costs may vary based on creative production, additional placements, and contract duration. Contact our team for a detailed quote.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative min-h-[280px]">
                                <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-slate-100"></div>
                                <div className="absolute top-4 left-4 z-[400] bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-indigo-200"></span> This Site
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                                        <span className="w-2 h-2 rounded-full bg-slate-400"></span> {otherBillboards.length} Other{otherBillboards.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div className="absolute bottom-4 right-4 z-[400] bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-[10px] font-bold text-slate-900 shadow-sm border border-slate-200">
                                    {billboard.coordinates.lat.toFixed(4)}, {billboard.coordinates.lng.toFixed(4)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Other locations grid shown under the featured billboard */}
                {type === 'billboard' && billboard && otherBillboards.length > 0 && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8">
                        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
                            <div>
                                <h2 className="text-xl font-black text-slate-900 leading-tight">More Locations</h2>
                                <p className="text-xs text-slate-900 font-medium uppercase tracking-wider mt-1">Explore our full network of {allBillboards.length} sites</p>
                            </div>
                            <a href="/locations" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-colors">
                                <Layers size={14}/> View Full Map
                            </a>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {otherBillboards.slice(0, 6).map(b => (
                                <a
                                    key={b.id}
                                    href={billboardLink(b)}
                                    className="group block rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-indigo-200 hover:shadow-md transition-all overflow-hidden"
                                >
                                    <div className="h-32 bg-slate-900 relative overflow-hidden">
                                        {b.imageUrl ? (
                                            <img src={b.imageUrl} alt={b.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-white/30 gap-1">
                                                <ImageIcon size={24}/>
                                                <span className="text-[8px] uppercase tracking-widest font-bold opacity-60">Coming Soon</span>
                                            </div>
                                        )}
                                        <span className="absolute top-2 right-2 bg-white/20 backdrop-blur text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-white/30">
                                            {b.type}
                                        </span>
                                    </div>
                                    <div className="p-4">
                                        <div className="font-bold text-slate-900 text-sm leading-snug truncate">{b.name}</div>
                                        <div className="flex items-center gap-1 text-[11px] text-slate-900 font-medium mt-1 truncate">
                                            <MapPin size={11} className="text-indigo-500 shrink-0"/> {b.location}, {b.town}
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-slate-900 uppercase tracking-wider font-bold mt-3 pt-3 border-t border-slate-100">
                                            <span className="flex items-center gap-1"><Maximize2 size={10}/> {b.width}x{b.height}m</span>
                                            <span className="flex items-center gap-1"><Car size={10}/> {b.dailyTraffic ? formatCompactNumber(b.dailyTraffic) : viewEstimates[b.id] ? formatCompactNumber(viewEstimates[b.id].dailyTraffic) + '*' : '-'}</span>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {/* Full Map View with Sidebar Inventory Panel */}
                {type === 'map' && (
                    <div className="flex gap-0 h-[calc(100vh-140px)]">
                        {/* Sidebar Inventory Panel */}
                        <div className="w-[340px] shrink-0 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col mr-4">
                            {/* Header */}
                            <div className="p-4 border-b border-slate-100">
                                <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                    <Layers size={16} className="text-indigo-500"/> 
                                    Inventory
                                    <span className="text-[10px] font-medium text-slate-900 ml-auto">{filteredBillboards.length} of {allBillboards.length} sites</span>
                                </h2>
                                
                                {/* Search */}
                                <div className="relative mt-3">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900" />
                                    <input
                                        type="text"
                                        placeholder="Search locations..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-colors"
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-900 hover:text-slate-900">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Filters */}
                                <div className="flex gap-2 mt-2">
                                    <select
                                        value={townFilter}
                                        onChange={(e) => setTownFilter(e.target.value)}
                                        className="flex-1 text-[10px] px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-indigo-300 text-slate-900 font-medium"
                                    >
                                        <option value="all">All Towns</option>
                                        {towns.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => setTypeFilter(e.target.value)}
                                        className="flex-1 text-[10px] px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-indigo-300 text-slate-900 font-medium"
                                    >
                                        <option value="all">All Types</option>
                                        <option value="Static">Static</option>
                                        <option value="LED">LED</option>
                                    </select>
                                </div>
                            </div>

                            {/* Billboard List */}
                            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                                {filteredBillboards.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-900 text-xs p-4">
                                        <Search size={24} className="mb-2 opacity-50"/>
                                        <p>No billboards match your filters.</p>
                                        <button 
                                            onClick={() => { setSearchQuery(''); setTownFilter('all'); setTypeFilter('all'); }}
                                            className="mt-2 text-indigo-500 font-bold hover:text-indigo-700"
                                        >
                                            Clear filters
                                        </button>
                                    </div>
                                ) : (
                                    filteredBillboards.map(b => {
                                        const effectiveTraffic = getEffectiveViews(b);
                                        const isSelected = selectedBoardId === b.id;
                                        return (
                                            <button
                                                key={b.id}
                                                onClick={() => focusMapOnBillboard(b.id)}
                                                disabled={!hasValidCoordinates(b)}
                                                className={`w-full text-left p-3 hover:bg-slate-50 transition-colors border-l-2 ${
                                                    isSelected ? 'border-l-indigo-500 bg-indigo-50/50' : 'border-l-transparent'
                                                } ${!hasValidCoordinates(b) ? 'opacity-70 cursor-not-allowed' : ''}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    {/* Thumbnail placeholder */}
                                                    <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0 flex items-center justify-center overflow-hidden">
                                                        {b.imageUrl ? (
                                                            <img src={b.imageUrl} alt="" className="w-full h-full object-cover"/>
                                                        ) : (
                                                            <ImageIcon size={16} className="text-slate-900" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-slate-800 text-xs truncate">{b.name}</div>
                                                        <div className="text-[10px] text-slate-900 truncate flex items-center gap-1 mt-0.5">
                                                            <MapPin size={9} className="shrink-0"/> {b.town}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1.5 text-[9px] text-slate-900 uppercase tracking-wider font-medium">
                                                            <span>{b.type}</span>
                                                            <span>·</span>
                                                            <span>{b.width}x{b.height}m</span>
                                                            {effectiveTraffic > 0 && (
                                                                <>
                                                                    <span>·</span>
                                                                    <span className="flex items-center gap-0.5">
                                                                        <Car size={8}/> {formatCompactNumber(effectiveTraffic)}{!b.dailyTraffic && viewEstimates[b.id] ? '*' : ''}/d
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {!hasValidCoordinates(b) && (
                                                            <div className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                                                                Coordinates needed
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer */}
                            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                                <p className="text-[9px] text-slate-900 leading-relaxed">
                                    <strong>Note:</strong> Billboard images are coming soon.{' '}
                                    {Object.keys(viewEstimates).length > 0 && (
                                        <span>* AI-estimated daily views via Groq.</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Map */}
                        <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
                            <div ref={mapContainerRef} className="w-full h-full bg-slate-100 z-0"></div>
                            
                            {/* Map overlay info */}
                            <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur px-4 py-3 rounded-2xl shadow-lg border border-slate-200">
                                <h2 className="font-bold text-slate-800 text-sm">Zimbabwe Billboard Map</h2>
                                <p className="text-xs text-slate-900 font-medium">{mappedBillboardsCount} mapped / {filteredBillboards.length} total</p>
                            </div>

                            {/* Images coming soon badge */}
                            <div className="absolute bottom-4 left-4 z-[400] bg-amber-50/90 backdrop-blur px-3 py-2 rounded-xl shadow-sm border border-amber-200 flex items-center gap-2">
                                <ImageIcon size={12} className="text-amber-500" />
                                <span className="text-[10px] font-medium text-amber-700">Billboard images coming soon</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Contact CTA */}
                {type === 'billboard' && billboard && (
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-8 sm:p-10 text-white shadow-xl">
                        <div className="max-w-2xl">
                            <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-3">Interested in this location?</h2>
                            <p className="text-indigo-200 text-sm sm:text-base leading-relaxed mb-6">
                                Get in touch with our team to discuss pricing, availability, and custom campaign packages tailored to your brand.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <a href="tel:+263242700291" className="inline-flex items-center gap-2.5 px-6 py-3 bg-white text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow-lg text-sm">
                                    <Phone size={16} /> Call +263 242 700 291
                                </a>
                                <a href="mailto:info@dreamboxadvertising.co.zw?subject=Inquiry: Billboard - {billboard.name}" className="inline-flex items-center gap-2.5 px-6 py-3 bg-indigo-500/30 text-white border border-indigo-400/40 font-bold rounded-xl hover:bg-indigo-500/50 transition-colors text-sm">
                                    <Mail size={16} /> Send Enquiry
                                </a>
                                <a href="/locations" className="inline-flex items-center gap-2.5 px-6 py-3 bg-white/10 text-white border border-white/20 font-bold rounded-xl hover:bg-white/20 transition-colors text-sm">
                                    <Layers size={16} /> Browse All Locations
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
