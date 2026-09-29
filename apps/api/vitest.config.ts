import { defineConfig } from 'vitest/config';

/**
 * Two projects, because they have different needs.
 *
 * `unit` runs everywhere, with no database: the API is tested through its
 * repository port, so a machine without Docker still gets a green suite.
 *
 * `db` needs a real PostgreSQL and is opt-in (`npm run test:db`). Its setup
 * applies the migrations to the test database and seeds it, which is also the
 * proof that a migration works from an empty database.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.db.test.ts', 'src/test/**'],
        },
      },
      {
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['src/test/databaseSetup.ts'],
          // One database, so files must not fight over it.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
