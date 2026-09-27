import { config as loadEnvFile } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The repository keeps one `.env` at its root; the Prisma CLI runs from
// apps/api, so the path is explicit rather than left to the working directory.
loadEnvFile({ path: new URL('../../.env', import.meta.url) });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
