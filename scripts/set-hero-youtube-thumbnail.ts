/**
 * Updates the company profile's heroImageUrl to the Dreambox
 * YouTube video thumbnail so the new animated hero background appears.
 *
 * Usage:
 *   railway run npx tsx scripts/set-hero-youtube-thumbnail.ts
 */

import { PrismaClient } from '@prisma/client';

const YT_THUMB = 'https://img.youtube.com/vi/30hzTKg7WFg/maxresdefault.jpg';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('📡 Updating heroImageUrl in production database…');

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
