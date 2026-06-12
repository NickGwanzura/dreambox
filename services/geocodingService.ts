import { api } from './apiClient';
import { TOWN_CENTERS } from '../utils/coordinates';

export interface GeocodeMatch {
  lat: number;
  lng: number;
  displayName: string;
  importance: number;
}

/**
 * Geocode a billboard location using the backend Nominatim proxy.
 * Falls back to the town center if no result is found.
 */
export async function geocodeLocation(
  location: string,
  town: string
): Promise<GeocodeMatch | null> {
  const query = location.trim();
  if (!query || !town.trim()) return null;

  try {
    const response = await api.get<{ results: GeocodeMatch[] }>('/api/geocode', {
      q: query,
      town,
    });
    if (response?.results && response.results.length > 0) {
      const best = response.results[0];
      return {
        lat: best.lat,
        lng: best.lng,
        displayName: best.displayName,
        importance: best.importance,
      };
    }
  } catch (e) {
    console.warn('[geocodeLocation] Nominatim lookup failed, falling back to town center', e);
  }

  const fallback = TOWN_CENTERS[town];
  if (fallback) {
    return {
      lat: fallback.lat,
      lng: fallback.lng,
      displayName: `${town} (town center fallback)`,
      importance: 0,
    };
  }

  return null;
}

/**
 * Bulk geocode a list of billboards. Processes one at a time with a small
 * delay to respect Nominatim rate limits.
 */
export async function bulkGeocodeBillboards(
  items: { id: string; location: string; town: string }[],
  onProgress?: (done: number, total: number, currentId?: string) => void
): Promise<{ id: string; result: GeocodeMatch | null; error?: string }[]> {
  const results: { id: string; result: GeocodeMatch | null; error?: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.id);
    try {
      const result = await geocodeLocation(item.location, item.town);
      results.push({ id: item.id, result });
    } catch (e: any) {
      results.push({ id: item.id, result: null, error: e.message || 'Unknown error' });
    }
    // Respect Nominatim usage policy (max ~1 req/sec for sustained bulk)
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 1100));
  }

  onProgress?.(items.length, items.length);
  return results;
}
