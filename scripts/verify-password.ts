import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = 'Zubi_2026$';

  // Check what's in DB
  const user = await prisma.user.findUnique({
    where: { email: 'nicholas.gwanzura@outlook.com' },
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('Found user:', user.email, user.role, user.status);
  console.log('Hash stored:', user.passwordHash);

  const valid = await bcrypt.compare(password, user.passwordHash);
  console.log('bcrypt.compare result:', valid);

  // Re-hash and update if broken
  if (!valid) {
    console.log('Hash mismatch — re-seeding...');
    const newHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email: 'nicholas.gwanzura@outlook.com' },
      data: { passwordHash: newHash, status: 'Active', mustResetPassword: false },
    });
    const recheck = await bcrypt.compare(password, newHash);
    console.log('Re-seeded. Re-verify:', recheck);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
