import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

/**
 * The Prisma client, in one place.
 *
 * Prisma 7 connects through a driver adapter, so the connection string arrives
 * here rather than living in the schema. Nothing else in the API constructs a
 * client, which means the test suite can point a client at the test database
 * and the running service can point at the development one.
 */

/**
 * Never log query arguments: intake text and client data flow through here.
 * `warn` and `error` are events, not payloads, so nothing sensitive reaches the
 * log by accident.
 */
const logLevels: Prisma.LogLevel[] =
  process.env['NODE_ENV'] === 'production' ? ['error'] : ['warn', 'error'];

export function createPrismaClient(connectionString: string): PrismaClient {
  if (connectionString.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and start the database with `npm run db:up`.',
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter, log: logLevels });
}

let shared: PrismaClient | undefined;

/**
 * The client the running service uses. Created on first use rather than at
 * import time, so that importing this module never opens a connection.
 */
export function getPrismaClient(): PrismaClient {
  shared ??= createPrismaClient(process.env['DATABASE_URL'] ?? '');
  return shared;
}

export async function closePrismaClient(): Promise<void> {
  if (shared !== undefined) {
    await shared.$disconnect();
    shared = undefined;
  }
}
