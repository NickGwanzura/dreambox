import type { Billboard } from '../types';

const TOWN_LIST_STORAGE_KEY = 'dreambox_location_towns';

/** Return the configured town list (persisted in localStorage), falling back to the built-in list. */
export function getConfiguredTowns(defaultTowns: string[]): string[] {
  try {
    const raw = localStorage.getItem(TOWN_LIST_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [...defaultTowns];
}

/** The Harare CBD fallback coordinate used by legacy forms and CSV import. */
export const HARARE_FALLBACK_COORDS = [
  { lat: -17.8292, lng: 31.0522 },
  { lat: -17.82, lng: 31.05 },
  { lat: -17.824858, lng: 31.053028 },
];

/** Approximate town centers used as map defaults and geocoding fallbacks. */
export const TOWN_CENTERS: Record<string, { lat: number; lng: number }> = {
  Harare: { lat: -17.8292, lng: 31.0522 },
  Bulawayo: { lat: -20.1325, lng: 28.6247 },
  Mutare: { lat: -18.9707, lng: 32.6509 },
  Gweru: { lat: -19.45, lng: 29.8167 },
  Kwekwe: { lat: -18.9281, lng: 29.8149 },
  Masvingo: { lat: -20.0637, lng: 30.8277 },
  Chinhoyi: { lat: -17.3667, lng: 30.2 },
  Marondera: { lat: -18.1853, lng: 31.5519 },
  Kadoma: { lat: -18.3333, lng: 29.9153 },
  'Victoria Falls': { lat: -17.9239, lng: 25.856 },
  Beitbridge: { lat: -22.2167, lng: 30 },
  Zvishavane: { lat: -20.3333, lng: 30.0333 },
  Bindura: { lat: -17.3019, lng: 31.3306 },
  Chitungwiza: { lat: -18.0127, lng: 31.0756 },
};

export function isFallbackCoordinate(lat: number, lng: number): boolean {
  return HARARE_FALLBACK_COORDS.some(
    (c) => Math.abs(c.lat - lat) < 0.001 && Math.abs(c.lng - lng) < 0.001
  );
}

export function hasValidCoordinates(b: Pick<Billboard, 'coordinates'> | undefined | null): boolean {
  if (!b?.coordinates) return false;
  const { lat, lng } = b.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (isFallbackCoordinate(lat, lng)) return false;
  return true;
}

export function hasMissingCoordinates(b: Pick<Billboard, 'coordinates'> | undefined | null): boolean {
  if (!b?.coordinates) return true;
  const { lat, lng } = b.coordinates;
  return !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0);
}

export function getTownCenter(town: string | undefined): { lat: number; lng: number } {
  if (town && TOWN_CENTERS[town]) return TOWN_CENTERS[town];
  return TOWN_CENTERS.Harare;
}

export function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
