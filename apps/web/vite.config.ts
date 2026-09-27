/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Repository root, so a single root `.env` feeds both apps. */
const repoRootEnvDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  // Read the root-level .env instead of apps/web/.env.
  envDir: repoRootEnvDir,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
