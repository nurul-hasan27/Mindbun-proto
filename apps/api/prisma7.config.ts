import { config as loadEnvFile } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The repository keeps one `.env` at its root; the Prisma CLI runs from
// apps/api, so the path is explicit rather than left to the working directory.
loadEnvFile({ path: new URL('../../.env', import.meta.url) });

const databaseUrl = process.env['DATABASE_URL'] ?? '';

/**
 * The throwaway database Prisma builds to compare migrations against.
 *
 * It lives on the same server as the development database, under a name nothing
 * else uses, and is created and dropped by the CLI. It is derived from
 * DATABASE_URL rather than written out here so that no credentials live in this
 * file; `SHADOW_DATABASE_URL` overrides it when a server needs a different one.
 */
function deriveShadowDatabaseUrl(url: string): string {
  if (url === '') {
    return '';
  }

  const shadow = new URL(url);
  const directory = shadow.pathname.replace(/\/[^/]*$/, '');
  shadow.pathname = `${directory}/wtm_shadow`;

  return shadow.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'] ?? deriveShadowDatabaseUrl(databaseUrl),
  },
});
