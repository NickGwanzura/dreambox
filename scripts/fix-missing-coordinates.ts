/**
 * One-time script to geocode billboards with missing or fallback coordinates.
 * Run with: npx tsx scripts/fix-missing-coordinates.ts
 *
 * Requires DATABASE_URL to be set in the environment.
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { hasValidCoordinates, isFallbackCoordinate } from '../utils/coordinates';

const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'DreamboxCRM/1.0 (locations@dreamboxadvertising.co.zw)';
const SLEEP_MS = 1100;

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

async function geocode(location: string, town: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = `${location}, ${town}, Zimbabwe`;
  const params = new URLSearchParams({ format: 'json', q, limit: '1', countrycodes: 'zw' });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  if (!data || data.length === 0) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const rows = await prisma.billboard.findMany({ orderBy: { createdAt: 'asc' } });
  const targets = rows.filter((r) => {
    const lat = r.coordinatesLat ?? 0;
    const lng = r.coordinatesLng ?? 0;
    return !hasValidCoordinates({ coordinates: { lat, lng } }) || isFallbackCoordinate(lat, lng);
  });

  console.log(`Found ${targets.length} billboard(s) with missing or fallback coordinates out of ${rows.length}.`);
  if (targets.length === 0) return;

  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    console.log(`[${i + 1}/${targets.length}] ${row.name} — ${row.location}, ${row.town}`);
    try {
      const result = await geocode(row.location, row.town);
      if (result) {
        await prisma.billboard.update({
          where: { id: row.id },
          data: { coordinatesLat: result.lat, coordinatesLng: result.lng },
        });
        console.log(`  ✓ ${result.displayName} (${result.lat}, ${result.lng})`);
        success++;
      } else {
        console.log(`  ✗ No result found`);
        failed++;
      }
    } catch (e: any) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
    if (i < targets.length - 1) await sleep(SLEEP_MS);
  }

  console.log('\nDone.');
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
}

main()
  .catch((e) => {
    console.error('Script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
