import { execFileSync } from 'node:child_process';
import { config as loadEnvFile } from 'dotenv';
import { testDatabaseUrl } from './database.js';

loadEnvFile({ path: new URL('../../../../.env', import.meta.url) });

/**
 * Prepares the test database: apply every migration, then seed it.
 *
 * Running this against a genuinely empty database is the migration test. If the
 * database is not reachable, the run fails with an explanation rather than a
 * wall of Prisma connection errors.
 */
function prisma(...args: string[]): void {
  execFileSync('npx', ['prisma', ...args], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  });
}

function assertReachable(): void {
  const url = new URL(testDatabaseUrl());

  try {
    execFileSync('docker', ['exec', 'why-this-match-postgres', 'pg_isready', '-U', 'wtm'], {
      stdio: 'pipe',
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      `The test database at ${url.host} is not responding. Start it with \`npm run db:up\` and try again.`,
    );
  }
}

export function setup(): void {
  assertReachable();
  prisma('migrate', 'deploy');
  prisma('db', 'seed');
  process.stdout.write('Test database migrated and seeded.\n');
}
