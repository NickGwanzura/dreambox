import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash('Zubi_2026$', 12);

  const user = await prisma.user.upsert({
    where: { email: 'nicholas.gwanzura@outlook.com' },
    update: {
      passwordHash: hash,
      role: 'Admin',
      status: 'Active',
      mustResetPassword: false,
    },
    create: {
      firstName: 'Nicholas',
      lastName: 'Gwanzura',
      email: 'nicholas.gwanzura@outlook.com',
      passwordHash: hash,
      role: 'Admin',
      status: 'Active',
      mustResetPassword: false,
    },
  });

  console.log('✓ Admin seeded:', user.email, `(${user.role} / ${user.status})`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
