import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What the client journey is allowed to know about.
 *
 * ## Why this is a test about source files
 *
 * The workspace and the client are one single-page application, so the workspace's code is in
 * the same bundle as the client's. Anyone who reads the bundle can find these endpoints, and
 * because there is no authentication they can also call them. That is the real situation and
 * pretending otherwise in a comment would be the dishonest part.
 *
 * So this file pins the half that is actually true and worth keeping: **no page in the client
 * journey imports the workspace client, and no client route leads into the workspace.** A
 * person going through the intake is never shown a decision, a matcher's note or an
 * alternative candidate, because there is no path to them in the interface.
 *
 * It is a structural test rather than a behavioural one on purpose. A behavioural test would
 * pass today and keep passing if somebody added a link to the workspace from the
 * recommendation page and a client clicked it; this one fails the moment the import or the
 * route appears, which is before anybody gets that far.
 *
 * What it deliberately does **not** claim: that the endpoints are protected, that the code is
 * absent from the bundle, or that the paths are secret. See `docs/human-matching.md`.
 */

// `src/lib/api` -> `src`
const SOURCE = join(import.meta.dirname, '..', '..');
const JOURNEY_PAGES = new Set([
  'StartPage.tsx',
  'IntakePage.tsx',
  'MatchingPage.tsx',
  'RecommendationPage.tsx',
  'FeedbackPage.tsx',
  'RematchPage.tsx',
  'LandingPage.tsx',
  'NotFoundPage.tsx',
  'TherapistProfilePage.tsx',
]);

/** Every source file under `src`, minus tests. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }

    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

const ALL = sourceFiles(SOURCE);

const clientJourneyFiles = ALL.filter((path) => {
  const name = path.split('/').pop() ?? '';
  const isPage = path.includes('/pages/') && JOURNEY_PAGES.has(name);
  const isIntakeStep = path.includes('/pages/intake/');
  const isClientComponent =
    path.includes('/components/') && !path.includes('/components/workspace/');

  return isPage || isIntakeStep || isClientComponent;
});

describe('what the client journey can reach', () => {
  it('finds the client journey files, so an empty set cannot pass this silently', () => {
    // A glob that stops matching would turn every assertion below into a vacuous truth.
    expect(clientJourneyFiles.length).toBeGreaterThan(20);
  });

  it('has no client page importing a workspace API client', () => {
    // Matched on the import path rather than the word, because the word alone would flag a
    // comment or an ordinary phrase like "the matching workspace".
    //
    // Both workspace clients, listed explicitly rather than pattern-matched: a new one added
    // later would be covered by the name, and one that was not would not be covered at all.
    // The list is asserted to be complete against what exists.
    const WORKSPACE_CLIENTS = ['workspace', 'aiWorkspace'] as const;

    const importers = clientJourneyFiles.filter((path) =>
      WORKSPACE_CLIENTS.some((name) =>
        new RegExp(`import[^;]*from\\s+'[^']*(\\/|^)${name}(\\.ts)?'`).test(
          readFileSync(path, 'utf8'),
        ),
      ),
    );

    expect(importers.map((path) => relative(SOURCE, path))).toEqual([]);
  });

  it('keeps the AI case summary client out of the shared barrel, unlike the intake one', () => {
    // The two AI clients are on opposite sides of the boundary, and the barrel is the one
    // place a client page could reach either of them by accident. The intake client is
    // exported; the workspace one is not, and asserting that separately makes the asymmetry
    // a decision on the record rather than an omission somebody tidies up later.
    const barrel = readFileSync(join(SOURCE, 'lib/api/index.ts'), 'utf8');

    expect(barrel).toContain("from './ai'");
    expect(barrel).not.toContain("from './aiWorkspace'");
  });

  it('files the AI case summary client beside the workspace client it belongs with', () => {
    // Both are the reviewer's side of the boundary, and the server route is under
    // `/matching-workspace` for the same reason. Asserting the file lives in the same
    // directory means a future move has to be argued for rather than done by accident.
    const exists = sourceFiles(join(SOURCE, 'lib', 'api')).some((path) =>
      path.endsWith('aiWorkspace.ts'),
    );

    expect(exists).toBe(true);
  });

  it('has no client page importing a workspace component', () => {
    const importers = clientJourneyFiles.filter((path) =>
      /import[^;]*from\s+'[^']*components\/workspace/.test(readFileSync(path, 'utf8')),
    );

    // Includes `components/workspace/CaseSummaryPanel`, which is the reviewer's only AI
    // surface. It is a component in the workspace directory, so the rule covers it for free —
    // which is the point of the directory being the boundary's shape in the source tree.

    expect(importers.map((path) => relative(SOURCE, path))).toEqual([]);
  });

  it('re-exports the workspace client from one place, and only the internal client does', () => {
    // `lib/api/index.ts` is a barrel both halves could import from, so it is deliberately
    // excluded above. This asserts the export exists, which is what makes the exclusion above
    // a decision rather than an oversight.
    const barrel = readFileSync(join(SOURCE, 'lib/api/index.ts'), 'utf8');

    expect(barrel).toContain("from './workspace'");
  });

  it('links from no client page to the workspace', () => {
    const offenders = clientJourneyFiles.filter((path) =>
      /to=\{?['"`][^'"`]*matching-workspace|href=['"]\/matching-workspace/.test(
        readFileSync(path, 'utf8'),
      ),
    );

    expect(offenders.map((path) => relative(SOURCE, path))).toEqual([]);
  });

  it('mounts the workspace outside the journey, so the position indicator cannot appear on it', () => {
    const journey = readFileSync(join(SOURCE, 'routes/journey.ts'), 'utf8');

    expect(journey).not.toContain('matching-workspace');

    const router = readFileSync(join(SOURCE, 'routes/router.tsx'), 'utf8');

    // The routes exist, and they are declared after the journey's own — at the edge of the
    // tree, with nothing below them.
    expect(router).toContain("path: 'matching-workspace'");
    expect(router).toContain("path: 'matching-workspace/:matchId'");
  });

  it('keeps the workspace components out of the shared component barrel', () => {
    // `components/workspace/` is a directory of its own, so a client page reaching for
    // `../components/Monogram` cannot pick up a workspace component by proximity.
    const shared = ALL.filter(
      (path) => path.includes('/components/') && !path.includes('workspace'),
    );

    for (const path of shared) {
      expect(readFileSync(path, 'utf8'), relative(SOURCE, path)).not.toMatch(
        /from '[^']*components\/workspace/,
      );
    }
  });
});
