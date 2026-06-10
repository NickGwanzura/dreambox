import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { log } from './serverLogger.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('[prisma] DATABASE_URL is not set. The application cannot connect to the database.');
    // Return a proxy that throws on any call so the server can still start
    // and respond to /health, but API calls will fail with a clear message.
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        return () => {
          throw new Error(
            `Database unavailable: DATABASE_URL is not configured. ` +
            `Please set the DATABASE_URL environment variable in your Railway service settings.`
          );
        };
      },
    });
  }

  try {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  } catch (e: any) {
    log.error(`[prisma] Failed to create Prisma client: ${e?.message}`);
    throw e;
  }
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
