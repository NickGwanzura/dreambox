import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const match = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Pana', mode: 'insensitive' } },
        { lastName: { contains: 'Pana', mode: 'insensitive' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true, status: true, role: true },
  });

  if (match.length > 0) {
    console.log('Found Panashe:');
    console.log(JSON.stringify(match, null, 2));
  } else {
    console.log('No user matching "Panashe" found. All users:');
    const all = await prisma.user.findMany({
      select: { firstName: true, lastName: true, email: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(JSON.stringify(all, null, 2));
  }

  await prisma.$disconnect();
}

main();
