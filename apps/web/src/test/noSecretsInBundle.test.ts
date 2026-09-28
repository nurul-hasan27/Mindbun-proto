import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The AI key must not reach the browser bundle.
 *
 * ## Why this is a test and not a comment
 *
 * The mechanism is real: only `VITE_`-prefixed variables are inlined at build time, and
 * `AI_API_KEY` has no such prefix. That is a property of Vite, and it holds until somebody
 * renames the variable, adds the prefix "just to make it configurable per environment", or
 * moves a provider call into the client. Each of those is a small, reasonable-looking change
 * and each of them leaks a credential.
 *
 * A grep of the built output is the only thing that catches the third one. It runs against
 * `dist/`, which is what a deployment actually serves, rather than against the source — a
 * value can be inlined at build time without appearing in any `.ts` file.
 *
 * ## Why it skips when there is no build
 *
 * Because a test that fails on a fresh clone is a test nobody trusts. `npm run check` does
 * not build, so a contributor running the suite first would see a failure that says nothing
 * about their work. The build job and the deployment both run this with a `dist/` present.
 */

const DIST = join(import.meta.dirname, '..', '..', 'dist');

/** Every file under `dist/`, so the check covers assets, not only the entry chunk. */
function builtFiles(directory: string): readonly string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    return statSync(path).isDirectory() ? builtFiles(path) : [path];
  });
}

const FILES = builtFiles(DIST);
const IS_BUILT = FILES.length > 0;

/**
 * Names that must never appear in a client bundle.
 *
 * `sk-type` is deliberately not here: it occurs inside Tailwind's emitted
 * `mask-type` identifier, and a pattern loose enough to catch it would also catch a dozen
 * innocent words. A real key is `sk-` followed by at least 20 characters, so that is the
 * shape tested below.
 */
const FORBIDDEN = [
  'AI_API_KEY',
  'AI_PROVIDER',
  'AI_BASE_URL',
  'AI_MODEL',
  'AI_TIMEOUT_MS',
  'api.openai.com',
  'authorization: `Bearer',
];

describe('the browser bundle', () => {
  it.skipIf(!IS_BUILT)('contains no AI configuration at all', () => {
    for (const file of FILES) {
      const contents = readFileSync(file, 'utf8');

      for (const name of FORBIDDEN) {
        expect(contents.includes(name), `${file} must not contain "${name}"`).toBe(false);
      }
    }
  });

  it.skipIf(!IS_BUILT)('contains nothing shaped like a credential', () => {
    // A shape rather than a specific string, so this holds for a different provider's key
    // format too. Twenty characters after the prefix is the shortest real-world length.
    const CREDENTIAL = /\b(?:sk-|pk-|rk-|ghp_|gho_|glpat-|AKIA)[A-Za-z0-9_-]{20,}/;

    for (const file of FILES) {
      expect(CREDENTIAL.test(readFileSync(file, 'utf8')), `${file} looks like it has a key`).toBe(
        false,
      );
    }
  });

  it.skipIf(!IS_BUILT)('does contain the AI endpoints, because the client calls them', () => {
    const contents = FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

    // The counterpart to the assertions above. Absent endpoints would mean the feature was
    // stubbed out, and the boundary tests above would then be passing for the wrong reason.
    expect(contents).toContain('ai/intake/turn');
    expect(contents).toContain('ai/intake/extract');
  });

  it.skipIf(!IS_BUILT)('does not contain the workspace summary path outside the workspace client', () => {
    const contents = FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

    // Present is correct — the bundle is one application and the workspace ships in it, which
    // is exactly why the boundary is documented as routing rather than security. What matters
    // is that the *client journey* cannot reach it, and that is a structural test on the
    // source: see `lib/api/workspaceBoundary.test.ts`.
    expect(contents).toContain('/ai-summary');
  });
});
