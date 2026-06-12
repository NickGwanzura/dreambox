import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, AlertTriangle, RefreshCw, CheckCircle, XCircle, Edit2, Search, Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { getBillboards, updateBillboard, ZIM_TOWNS, subscribe } from '../../services/mockData';
import { bulkGeocodeBillboards, GeocodeMatch } from '../../services/geocodingService';
import { hasValidCoordinates, hasMissingCoordinates, isFallbackCoordinate, TOWN_CENTERS, getConfiguredTowns } from '../../utils/coordinates';
import type { Billboard } from '../../types';

const STORAGE_KEY = 'dreambox_location_towns';

function saveTownList(towns: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(towns));
  } catch {}
}

export const LocationSettings: React.FC = () => {
  const [billboards, setBillboards] = useState<Billboard[]>(getBillboards());
  const [towns, setTowns] = useState<string[]>(getConfiguredTowns(ZIM_TOWNS));
  const [search, setSearch] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; currentId?: string } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ id: string; name: string; status: 'success' | 'failed'; message: string }[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [newTown, setNewTown] = useState('');
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setBillboards([...getBillboards()]);
    });
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const total = billboards.length;
    const mapped = billboards.filter((b) => hasValidCoordinates(b)).length;
    const missing = billboards.filter((b) => hasMissingCoordinates(b)).length;
    const fallback = billboards.filter(
      (b) =>
        !hasMissingCoordinates(b) &&
        isFallbackCoordinate(b.coordinates.lat, b.coordinates.lng)
    ).length;
    return { total, mapped, missing, fallback };
  }, [billboards]);

  const missingBoards = useMemo(() => {
    return billboards
      .filter((b) => !hasValidCoordinates(b))
      .filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.location.toLowerCase().includes(search.toLowerCase()) ||
        b.town.toLowerCase().includes(search.toLowerCase())
      );
  }, [billboards, search]);

  const validBoards = useMemo(() => billboards.filter((b) => hasValidCoordinates(b)), [billboards]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([-19.0, 29.9], 7);
      mapRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: 'OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);
    }

    const map = mapRef.current;
    // Clear markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    if (validBoards.length === 0) return;

    const DefaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });

    const SelectedIcon = L.divIcon({
      className: 'dreambox-selected-marker',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#059669;border:3px solid #fff;box-shadow:0 0 0 4px rgba(5,150,105,0.35),0 4px 14px rgba(15,23,42,0.4);"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });

    validBoards.forEach((b) => {
      const isSelected = b.id === selectedBoardId;
      L.marker([b.coordinates.lat, b.coordinates.lng], {
        icon: isSelected ? SelectedIcon : DefaultIcon,
        zIndexOffset: isSelected ? 1000 : 0,
      })
        .addTo(map)
        .bindPopup(`<strong>${b.name}</strong><br/>${b.location}, ${b.town}`)
        .on('click', () => setSelectedBoardId(b.id));
    });

    const bounds = L.latLngBounds(validBoards.map((b) => [b.coordinates.lat, b.coordinates.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [validBoards, selectedBoardId]);

  const handleGeocodeSingle = async (board: Billboard) => {
    try {
      const result = await bulkGeocodeBillboards([{ id: board.id, location: board.location, town: board.town }]);
      const r = result[0];
      if (r.result) {
        await updateBillboard({ ...board, coordinates: { lat: r.result.lat, lng: r.result.lng } });
        setBulkResults((prev) => [
          ...prev,
          { id: board.id, name: board.name, status: 'success', message: `${r.result!.displayName}` },
        ]);
      } else {
        setBulkResults((prev) => [
          ...prev,
          { id: board.id, name: board.name, status: 'failed', message: r.error || 'No result' },
        ]);
      }
    } catch (e: any) {
      setBulkResults((prev) => [
        ...prev,
        { id: board.id, name: board.name, status: 'failed', message: e.message || 'Error' },
      ]);
    }
  };

  const handleBulkGeocode = async () => {
    const targets = missingBoards.map((b) => ({ id: b.id, location: b.location, town: b.town }));
    if (targets.length === 0) return;
    setBulkLoading(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: targets.length });

    try {
      const results = await bulkGeocodeBillboards(targets, (done, total, currentId) => {
        setBulkProgress({ done, total, currentId });
      });

      const summary: typeof bulkResults = [];
      for (const r of results) {
        const board = billboards.find((b) => b.id === r.id);
        if (!board) continue;
        if (r.result) {
          await updateBillboard({ ...board, coordinates: { lat: r.result.lat, lng: r.result.lng } });
          summary.push({ id: r.id, name: board.name, status: 'success', message: r.result.displayName });
        } else {
          summary.push({ id: r.id, name: board.name, status: 'failed', message: r.error || 'No result' });
        }
      }
      setBulkResults(summary);
    } finally {
      setBulkLoading(false);
      setBulkProgress(null);
    }
  };

  const handleAddTown = () => {
    const t = newTown.trim();
    if (!t || towns.includes(t)) return;
    const next = [...towns, t].sort();
    setTowns(next);
    saveTownList(next);
    // Provide a default center for unknown towns so map picker doesn't break
    if (!TOWN_CENTERS[t]) {
      TOWN_CENTERS[t] = { lat: -19.0, lng: 29.9 };
    }
    setNewTown('');
  };

  const handleDeleteTown = (town: string) => {
    const inUse = billboards.some((b) => b.town === town);
    if (inUse) {
      alert(`Cannot delete "${town}" because it is used by one or more billboards.`);
      return;
    }
    const next = towns.filter((t) => t !== town);
    setTowns(next);
    saveTownList(next);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="text-indigo-600" /> Location Settings
        </h3>
        <p className="text-sm text-slate-900 mt-1">Manage billboard coordinates, towns, and map coverage.</p>
      </div>

      {/* Coordinate Health Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-900 mb-1">Total Billboards</p>
          <p className="text-3xl font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Mapped</p>
          <p className="text-3xl font-black text-emerald-600">{stats.mapped}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Missing Coords</p>
          <p className="text-3xl font-black text-amber-600">{stats.missing}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 mb-1">Fallback Locations</p>
          <p className="text-3xl font-black text-rose-600">{stats.fallback}</p>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h4 className="text-lg font-bold text-slate-900">Bulk Geocode</h4>
            <p className="text-xs text-slate-900">Automatically look up coordinates for billboards that are missing them.</p>
          </div>
          <button
            onClick={handleBulkGeocode}
            disabled={bulkLoading || missingBoards.length === 0}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {bulkLoading ? 'Geocoding...' : `Geocode ${missingBoards.length} Missing`}
          </button>
        </div>

        {bulkProgress && (
          <div className="mb-4">
            <div className="flex justify-between text-xs font-bold text-slate-900 mb-1">
              <span>Progress</span>
              <span>{bulkProgress.done} / {bulkProgress.total}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {bulkResults.length > 0 && (
          <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-bold text-slate-900">Billboard</th>
                  <th className="px-4 py-2 font-bold text-slate-900">Status</th>
                  <th className="px-4 py-2 font-bold text-slate-900">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bulkResults.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-2">
                      {r.status === 'success' ? (
                        <span className="flex items-center gap-1 text-emerald-600"><CheckCircle size={12} /> Success</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600"><XCircle size={12} /> Failed</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-900 truncate max-w-xs" title={r.message}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Missing coordinates table */}
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h4 className="text-lg font-bold text-slate-900">Missing Coordinates</h4>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-bold text-xs uppercase text-slate-900 tracking-wider">Name</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase text-slate-900 tracking-wider">Location</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase text-slate-900 tracking-wider">Town</th>
                  <th className="px-4 py-3 font-bold text-xs uppercase text-slate-900 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {missingBoards.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{b.name}</td>
                    <td className="px-4 py-3 text-slate-900">{b.location}</td>
                    <td className="px-4 py-3 text-slate-900">{b.town}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleGeocodeSingle(b)}
                        disabled={bulkLoading}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                      >
                        Geocode
                      </button>
                    </td>
                  </tr>
                ))}
                {missingBoards.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-900 italic">
                      <CheckCircle size={16} className="inline mr-2 text-emerald-600" />
                      All billboards have valid coordinates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Town management + map preview */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h4 className="text-lg font-bold text-slate-900 mb-4">Towns</h4>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTown}
                onChange={(e) => setNewTown(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTown()}
                placeholder="Add town..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
              />
              <button
                onClick={handleAddTown}
                disabled={!newTown.trim() || towns.includes(newTown.trim())}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl">
              <ul className="divide-y divide-slate-100">
                {towns.map((town) => (
                  <li key={town} className="px-3 py-2 flex justify-between items-center text-sm text-slate-900">
                    {town}
                    <button
                      onClick={() => handleDeleteTown(town)}
                      className="p-1 text-slate-900 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[10px] text-slate-900 mt-2">
              Towns are used in billboard forms and fallback map centers. New towns default to Zimbabwe center until geocoded.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h4 className="text-lg font-bold text-slate-900 mb-4">Map Preview</h4>
            <div className="h-64 w-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
              <div ref={mapContainerRef} className="w-full h-full" />
            </div>
            <p className="text-[10px] text-slate-900 mt-2">
              {validBoards.length} billboard{validBoards.length === 1 ? '' : 's'} currently visible on the map.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
