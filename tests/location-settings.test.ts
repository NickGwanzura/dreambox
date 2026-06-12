import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasValidCoordinates,
  hasMissingCoordinates,
  isFallbackCoordinate,
  HARARE_FALLBACK_COORDS,
  TOWN_CENTERS,
  getTownCenter,
  formatCoordinate,
} from '../utils/coordinates';
import { bulkGeocodeBillboards } from '../services/geocodingService';

// ============================================================
// Coordinate helpers
// ============================================================

describe('hasValidCoordinates', () => {
  it('returns true for real coordinates', () => {
    expect(hasValidCoordinates({ coordinates: { lat: -17.85, lng: 31.05 } })).toBe(true);
  });

  it('returns false for 0,0', () => {
    expect(hasValidCoordinates({ coordinates: { lat: 0, lng: 0 } })).toBe(false);
  });

  it('returns false for missing coordinates object', () => {
    expect(hasValidCoordinates({} as any)).toBe(false);
    expect(hasValidCoordinates(null as any)).toBe(false);
  });

  it('returns false for out-of-range values', () => {
    expect(hasValidCoordinates({ coordinates: { lat: 91, lng: 0 } })).toBe(false);
    expect(hasValidCoordinates({ coordinates: { lat: 0, lng: 181 } })).toBe(false);
  });

  it('returns false for non-finite values', () => {
    expect(hasValidCoordinates({ coordinates: { lat: NaN, lng: 0 } })).toBe(false);
  });

  it('returns false for Harare fallback coordinates', () => {
    for (const c of HARARE_FALLBACK_COORDS) {
      expect(hasValidCoordinates({ coordinates: c })).toBe(false);
    }
  });
});

describe('hasMissingCoordinates', () => {
  it('returns true when coordinates are missing or 0,0', () => {
    expect(hasMissingCoordinates({ coordinates: { lat: 0, lng: 0 } })).toBe(true);
    expect(hasMissingCoordinates({} as any)).toBe(true);
  });

  it('returns false for valid coordinates', () => {
    expect(hasMissingCoordinates({ coordinates: { lat: -17.85, lng: 31.05 } })).toBe(false);
  });
});

describe('isFallbackCoordinate', () => {
  it('detects Harare fallback coordinates within tolerance', () => {
    expect(isFallbackCoordinate(-17.8292, 31.0522)).toBe(true);
    expect(isFallbackCoordinate(-17.82925, 31.05215)).toBe(true);
  });

  it('returns false for distinct coordinates', () => {
    expect(isFallbackCoordinate(-17.9, 31.1)).toBe(false);
  });
});

describe('getTownCenter', () => {
  it('returns known town centers', () => {
    expect(getTownCenter('Harare')).toEqual(TOWN_CENTERS.Harare);
    expect(getTownCenter('Bulawayo')).toEqual(TOWN_CENTERS.Bulawayo);
  });

  it('falls back to Harare for unknown towns', () => {
    expect(getTownCenter('UnknownTown')).toEqual(TOWN_CENTERS.Harare);
  });
});

describe('formatCoordinate', () => {
  it('formats lat/lng to 5 decimals', () => {
    expect(formatCoordinate(-17.829222, 31.052222)).toBe('-17.82922, 31.05222');
  });
});

// ============================================================
// Geocoding service
// ============================================================

describe('bulkGeocodeBillboards', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    // geocodingService uses apiClient which expects a browser environment
    (global as any).window = { location: { origin: 'http://localhost' } };
    (global as any).localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).window;
    delete (global as any).localStorage;
  });

  it('resolves coordinates from the API and falls back to town center', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { lat: -17.85, lng: 31.05, displayName: 'Test Location, Harare', importance: 0.5 },
        ],
      }),
    });

    const results = await bulkGeocodeBillboards([
      { id: '1', location: 'Test Location', town: 'Harare' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].result).toMatchObject({ lat: -17.85, lng: 31.05 });
  });

  it('falls back to town center when API returns no results', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const results = await bulkGeocodeBillboards([
      { id: '1', location: 'Unknown Place', town: 'Harare' },
    ]);

    expect(results[0].result).toMatchObject({ lat: TOWN_CENTERS.Harare.lat, lng: TOWN_CENTERS.Harare.lng });
  });
});
