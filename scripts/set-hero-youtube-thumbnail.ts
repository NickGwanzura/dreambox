/**
 * Updates the company profile's heroImageUrl to the Dreambox
 * YouTube video thumbnail so the new animated hero background appears.
 *
 * Usage:
 *   npx tsx scripts/set-hero-youtube-thumbnail.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const YT_THUMB = 'https://img.youtube.com/vi/30hzTKg7WFg/maxresdefault.jpg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Run via: npx tsx scripts/set-hero-youtube-thumbnail.ts');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('📡 Updating heroImageUrl in production database…');
    console.log(`   URL: ${databaseUrl.slice(0, 30)}…`);

    const updated = await prisma.companyProfile.upsert({
      where: { id: 'profile_v1' },
      update: { heroImageUrl: YT_THUMB },
      create: {
        id: 'profile_v1',
        name: 'Dreambox Advertising',
        heroImageUrl: YT_THUMB,
      },
    });

    console.log(`✅ heroImageUrl set to:\n   ${updated.heroImageUrl}`);
  } catch (err) {
    console.error('❌ Failed to update heroImageUrl:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
