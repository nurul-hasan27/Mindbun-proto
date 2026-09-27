import { createPrismaClient } from '../lib/prisma.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * The test database, and the guard that keeps it separate.
 *
 * These tests create and delete rows. Pointing them at the development database
 * would quietly destroy real work, so the check below is a hard failure rather
 * than a warning — and it also catches the easy mistake of forgetting to set
 * TEST_DATABASE_URL at all, which would otherwise silently fall back to
 * DATABASE_URL.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['TEST_DATABASE_URL']?.trim() ?? '';
  const developmentUrl = env['DATABASE_URL']?.trim() ?? '';

  if (url === '') {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env — docker-compose creates why_this_match_test for you.',
    );
  }

  if (url === developmentUrl) {
    throw new Error(
      'TEST_DATABASE_URL and DATABASE_URL are the same. The test suite would delete development data, so it refuses to run.',
    );
  }

  return url;
}

export function createTestPrismaClient(env: NodeJS.ProcessEnv = process.env): PrismaClient {
  return createPrismaClient(testDatabaseUrl(env));
}
