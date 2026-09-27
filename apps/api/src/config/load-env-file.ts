import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, resolved from this file's location (works for src and dist). */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Loads the repository-level `.env` file into `process.env` if it exists.
 *
 * Real process environment variables take precedence, so shell and CI
 * configuration always win over the local file.
 */
export function loadRootEnvFile(): boolean {
  const envFile = path.join(repoRoot, '.env');

  if (!existsSync(envFile)) {
    return false;
  }

  process.loadEnvFile(envFile);
  return true;
}
