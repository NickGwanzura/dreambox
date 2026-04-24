import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const matches = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: 'charles', mode: 'insensitive' } },
        { lastName: { contains: 'charles', mode: 'insensitive' } },
        { email: { contains: 'charles', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      mustResetPassword: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAt: true,
      lastLoginIp: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (matches.length === 0) {
    console.log('No user matching "Charles" found (first name / last name / email).');
    await prisma.$disconnect();
    return;
  }

  const now = new Date();

  for (const u of matches) {
    const isLocked = u.lockedUntil && u.lockedUntil > now;
    const lockMinsRemaining = isLocked
      ? Math.ceil((u.lockedUntil!.getTime() - now.getTime()) / 60000)
      : 0;

    console.log('─'.repeat(60));
    console.log(`USER: ${u.firstName} ${u.lastName}  <${u.email}>`);
    console.log(`  id:                   ${u.id}`);
    console.log(`  role:                 ${u.role}`);
    console.log(`  status:               ${u.status}   ${u.status === 'Active' ? '✓' : '← BLOCKS LOGIN'}`);
    console.log(`  mustResetPassword:    ${u.mustResetPassword}`);
    console.log(`  failedLoginAttempts:  ${u.failedLoginAttempts}`);
    console.log(`  lockedUntil:          ${u.lockedUntil ? u.lockedUntil.toISOString() : 'null'}${isLocked ? `  ← LOCKED (${lockMinsRemaining} min remaining)` : ''}`);
    console.log(`  lastLoginAt:          ${u.lastLoginAt ? u.lastLoginAt.toISOString() : 'never'}`);
    console.log(`  lastLoginIp:          ${u.lastLoginIp ?? 'null'}`);
    console.log(`  createdAt:            ${u.createdAt.toISOString()}`);
    console.log(`  updatedAt:            ${u.updatedAt.toISOString()}`);

    const history = await prisma.loginHistory.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { success: true, reason: true, ip: true, createdAt: true },
    });

    console.log(`  recent login attempts (last ${history.length}):`);
    if (history.length === 0) {
      console.log('    (none recorded)');
    } else {
      for (const h of history) {
        console.log(`    ${h.createdAt.toISOString()}  ${h.success ? 'SUCCESS' : 'FAIL   '}  ${h.reason ?? '-'}  from ${h.ip ?? '?'}`);
      }
    }
  }

  console.log('─'.repeat(60));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
