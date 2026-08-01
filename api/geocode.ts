import type { HttpRequest, HttpResponse } from '../lib/http';
import { cors } from '../lib/auth';
import { log } from '../lib/serverLogger.js';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  importance: number;
}

interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  importance: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { cachedAt: number; results: GeocodeResult[] }>();

function getCacheKey(q: string, town?: string): string {
  return `${town || ''}::${q}`.toLowerCase().trim();
}

function getCached(q: string, town?: string): GeocodeResult[] | undefined {
  const key = getCacheKey(q, town);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.results;
}

function setCached(q: string, town: string | undefined, results: GeocodeResult[]): void {
  cache.set(getCacheKey(q, town), { cachedAt: Date.now(), results });
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, town } = req.query;
  const query = typeof q === 'string' ? q.trim() : '';
  const townName = typeof town === 'string' ? town.trim() : undefined;

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const cached = getCached(query, townName);
  if (cached) return res.status(200).json({ results: cached });

  const searchQuery = townName ? `${query}, ${townName}, Zimbabwe` : `${query}, Zimbabwe`;
  const params = new URLSearchParams({
    format: 'json',
    q: searchQuery,
    limit: '5',
    countrycodes: 'zw',
  });

  try {
    const userAgent = process.env.NOMINATIM_USER_AGENT || 'DreamboxCRM/1.0 (locations@dreamboxadvertising.co.zw)';
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      log.error('[geocode] Nominatim error:', response.status, response.statusText);
      return res.status(502).json({ error: 'Geocoding service unavailable' });
    }

    const data = (await response.json()) as NominatimResult[];
    const results: GeocodeResult[] = (data || [])
      .filter((r) => r.lat && r.lon)
      .map((r) => ({
        displayName: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        importance: r.importance ?? 0,
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    setCached(query, townName, results);
    return res.status(200).json({ results });
  } catch (e: any) {
    log.error('[geocode]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
