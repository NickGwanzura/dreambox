
import React, { useEffect, useState, useRef } from 'react';
import { getBillboards, getCompanyLogo } from '../services/mockData';
import { Billboard } from '../types';
import L from 'leaflet';
import { MapPin, Maximize2, Car, Layers, Zap, X, ExternalLink } from 'lucide-react';

interface PublicViewProps {
    type: 'billboard' | 'map';
    billboardId?: string;
}

export const PublicView: React.FC<PublicViewProps> = ({ type, billboardId }) => {
    const [billboard, setBillboard] = useState<Billboard | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const logo = getCompanyLogo();

    useEffect(() => {
        if (type === 'billboard' && billboardId) {
            const allBoards = getBillboards();
            const found = allBoards.find(b => b.id === billboardId);
            setBillboard(found || null);
        }
    }, [type, billboardId]);

    useEffect(() => {
        // Initialize Map
        if (!mapContainerRef.current) return;
        
        // If map doesn't exist, create it
        if (!mapRef.current) {
            const defaultCoords: [number, number] = [-17.824858, 31.053028]; // Harare Default
            
            const map = L.map(mapContainerRef.current).setView(defaultCoords, 13);
            mapRef.current = map;
            
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
                attribution: 'OpenStreetMap' 
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

        // Clear existing layers to prevent duplicates on re-render
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        if (type === 'billboard' && billboard && billboard.coordinates) {
            const { lat, lng } = billboard.coordinates;
            // Fly to the specific billboard location
            map.setView([lat, lng], 16);
            
            L.marker([lat, lng], { icon: DefaultIcon })
             .addTo(map)
             .bindPopup(`<b>${billboard.name}</b><br>${billboard.location}`)
             .openPopup();
        } else if (type === 'map') {
            // Show all billboards
            const allBoards = getBillboards();
            if (allBoards.length > 0) {
                const bounds = L.latLngBounds(allBoards.map(b => [b.coordinates.lat, b.coordinates.lng]));
                map.fitBounds(bounds, { padding: [50, 50] });
            }

            allBoards.forEach(b => {
                if(b.coordinates) {
                    L.marker([b.coordinates.lat, b.coordinates.lng], { icon: DefaultIcon })
                     .addTo(map)
                     .bindPopup(`
                        <div style="min-width: 150px;">
                            <strong>${b.name}</strong><br/>
                            <span style="font-size:10px; color:#666;">${b.type} • ${b.width}x${b.height}m</span><br/>
                            <a href="?public=true&type=billboard&id=${b.id}" style="color:#6366f1; font-size:10px; text-decoration:none; font-weight:bold;">View Details &rarr;</a>
                        </div>
                     `);
                }
            });
        }

        // Cleanup function (optional, but good practice to invalidate size if container changes)
        map.invalidateSize();

    }, [billboard, type]);

    if (type === 'billboard' && !billboard) {
        return (
            <div className="h-screen flex flex-col items-center justify-center text-slate-500 bg-slate-50">
                <MapPin size={48} className="mb-4 text-slate-300"/>
                <h2 className="text-xl font-bold text-slate-800">Billboard Not Found</h2>
                <p className="text-sm">The requested billboard ID is invalid or does not exist.</p>
                <a href="?public=true&type=map" className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-slate-800 transition-all">View Full Map</a>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Public Header */}
            <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    {logo ? <img src={logo} alt="Logo" className="w-10 h-10 rounded-lg object-cover border border-slate-100"/> : <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">D</div>}
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 leading-tight">Dreambox Locations</h1>
                        <p className="text-xs text-slate-500">Public Asset Viewer</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    {type === 'billboard' && (
                        <a href="?public=true&type=map" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors">
                            <Layers size={14}/> View Full Map
                        </a>
                    )}
                    <a href="/" className="px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2">
                        Login <ExternalLink size={12} />
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
                                    <div className="w-full h-full flex flex-col items-center justify-center text-white/30 gap-2">
                                        <div className="p-4 rounded-full bg-white/5"><Maximize2 size={32}/></div>
                                        <span className="text-xs uppercase tracking-widest font-bold">No Image Available</span>
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
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Dimensions</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
                                    <div className="text-indigo-500 mb-2 flex justify-center"><Car size={24}/></div>
                                    <div className="font-black text-slate-800 text-lg">{billboard.dailyTraffic?.toLocaleString() || '-'}</div>
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Daily Views</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow">
                                    <div className="text-indigo-500 mb-2 flex justify-center"><Layers size={24}/></div>
                                    <div className="font-black text-slate-800 text-lg">{billboard.type === 'Static' ? '2 Sides' : `${billboard.totalSlots} Slots`}</div>
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Configuration</div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Info & Map */}
                        <div className="space-y-6 flex flex-col h-full">
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                                <h1 className="text-3xl font-black text-slate-900 mb-2 leading-tight">{billboard.name}</h1>
                                <div className="flex items-center gap-2 text-slate-500 font-medium mb-6">
                                    <MapPin size={18} className="text-indigo-500 fill-indigo-50"/> {billboard.location}, {billboard.town}
                                </div>
                                <div className="prose prose-slate text-sm text-slate-600 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <p>{billboard.visibility || "Premium advertising space located in a high-traffic area, offering excellent visibility for brands seeking maximum exposure."}</p>
                                </div>
                            </div>

                            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative min-h-[300px]">
                                <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-slate-100"></div>
                                <div className="absolute bottom-4 right-4 z-[400] bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-[10px] font-bold text-slate-500 shadow-sm border border-slate-200">
                                    {billboard.coordinates.lat.toFixed(4)}, {billboard.coordinates.lng.toFixed(4)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Full Map View */}
                {type === 'map' && (
                    <div className="h-[calc(100vh-140px)] bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
                        <div ref={mapContainerRef} className="w-full h-full bg-slate-100 z-0"></div>
                        <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur px-4 py-3 rounded-2xl shadow-lg border border-slate-200">
                            <h2 className="font-bold text-slate-800 text-sm">Inventory Map</h2>
                            <p className="text-xs text-slate-500 font-medium">{getBillboards().length} Locations</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
