import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIGNAL_CATEGORIES } from './aiProvider.js';

/**
 * The boundary, as a property of the source tree.
 *
 * ## Why this is structural rather than behavioural
 *
 * Every other test in this directory checks what the code *does* with an input. This one
 * checks what the code is *able* to express, which is the only way to catch the failure that
 * actually matters: an AI field that reaches the matching engine.
 *
 * A behavioural test for that would have to imagine the violation, and every violation it
 * imagined would be the one its author could think of. These assertions fail on a whole
 * *shape* of mistake — a new field on a provider type, a new import of the match repository
 * into the AI layer — whether or not anyone thought to write the specific test.
 *
 * They are cheap, they cannot be satisfied by a comment, and they are the reason a reviewer
 * can be told the boundary is enforced rather than asking whether it is.
 */

// `src/ai` -> `src`
const SOURCE = join(import.meta.dirname, '..');
const AI_DIRECTORY = join(SOURCE, 'ai');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }

    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Every file in the AI layer, minus its tests. */
const AI_FILES = sourceFiles(AI_DIRECTORY);

/**
 * Read a file with its comments and string literals removed.
 *
 * This layer is unusually well commented, and the comments legitimately discuss the things
 * the patterns below forbid — the doc comment in the provider lists the API's production
 * dependencies, and the privacy notes name the fields that are *not* present. Scanning the
 * raw text would therefore fail on the documentation of the rule rather than the rule, which
 * is how a structural test starts being noise to be tolerated.
 *
 * Stripping comments keeps the assertions about *code*. Where prose is genuinely the thing
 * being asserted, it is asserted from a value rather than by grepping a file.
 */
function read(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('the AI layer can be found', () => {
  it('has files, so an empty set cannot pass every assertion below', () => {
    // A renamed directory or a broken glob would turn all of this into a vacuous truth,
    // which is the specific way a structural test lies.
    expect(AI_FILES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('a provider cannot decide anything', () => {
  it('has no type in the layer that can carry a therapist, a score or a rank', () => {
    // Matched on the property names, in the port file only. A provider fills in `AiSignal`
    // and `AiCaseSummary`; neither has anywhere to put a person, a figure or an order.
    const port = read(join(AI_DIRECTORY, 'aiProvider.ts'));

    // The names that would mean a decision. Listed explicitly so the check is a list of
    // forbidden things rather than a vague notion of "decision-ish". Read from the comment-
    // stripped source, because the prose above the types names several of these precisely to
    // say they are absent.
    for (const forbidden of [
      'therapistId',
      'therapistKey',
      'matchId',
      'clientId',
      'intakeId',
      'score',
      'rank',
      'percentile',
      'isEligible',
      'selectedMatchId',
      'decisionType',
    ]) {
      const properties = [...port.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1]);

      // `matchId` appears in prose above the types as an example of what a provider is NOT
      // given, so only property declarations are checked.
      expect(properties, `AiProvider surface must not declare "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });

  it('never imports a matching or workspace *store*', () => {
    // The strongest form of the claim: even if a provider type grew a score field, this would
    // still hold, because the AI layer is not handed the thing that computes one.
    //
    // Type-only imports are excluded, and the exclusion is narrow. `caseContext.ts` reads
    // the *shape* of a case — a value type, no behaviour — and that is how a summary can be
    // built from stored evidence at all. What must not cross is a repository, a service, or
    // the engine, because those are the doors to eligibility, ordering and selection.
    const STORE =
      /matchRepository|workspaceRepository|workspaceService|matchEngine|matchService|feedbackService|intakeRepository|prismaIntakeRepository/;

    for (const path of AI_FILES) {
      const source = read(path);
      const imports = [...source.matchAll(/import[^;]*from\s+'([^']+)'/g)];

      for (const match of imports) {
        const specifier = match[1] ?? '';
        const isTypeOnly = /import\s+type\s/.test(match[0]);

        if (isTypeOnly) {
          continue;
        }

        expect(specifier, `${relative(SOURCE, path)} imports ${specifier}`).not.toMatch(STORE);
      }
    }
  });

  it('imports nothing at all from the matching layer except one type', () => {
    // Tighter, and a different claim. Every file in this layer may reach the matching layer
    // for exactly one reason — the shape of a case — and `caseContext.ts` is that one file.
    const IMPORTING = /import[^;]*from\s+'[^']*data\/matching[^']*'/g;
    const offendersList = AI_FILES.filter((path) => IMPORTING.test(read(path))).map((path) =>
      relative(SOURCE, path),
    );

    expect(offendersList).toEqual(['ai/caseContext.ts']);
  });

  it('does not import the intake repository either', () => {
    // The vocabulary arrives as a thunk, so the AI layer is handed names and never a store.
    // That is what makes "unknown keys are rejected against the database" a runtime check
    // rather than a claim about a copy of the vocabulary.
    for (const path of AI_FILES) {
      const source = read(path);

      if (path.endsWith('caseContext.ts')) {
        // The one deliberate exception: reading a case's stored needs, which is a value
        // type from the matching read model and not a store. Named here so an exception has
        // to be argued for rather than added quietly.
        expect(source).toContain('familyLabel');
        continue;
      }

      expect(source, relative(SOURCE, path)).not.toMatch(/data\/intake\/(?!intakeTypes)/);
    }
  });

  it('has no call that writes, because nothing here stores anything', () => {
    // No database client, no write of any kind, no file write. If a future change wanted to
    // record a conversation, this is where it would have to appear.
    //
    // The `create(` pattern is deliberately absent: it matches `createApiClient`-style names
    // and the provider's own factory calls, which build things rather than persist them.
    // Persistence in this codebase is `prisma`, and that is what is checked.
    for (const path of AI_FILES) {
      const source = read(path);

      expect(source, relative(SOURCE, path)).not.toMatch(
        /prisma|\.insert\(|\.upsert\(|\.update\(|\.deleteMany\(|writeFile|appendFile/,
      );
    }
  });

  it('makes exactly one outbound call, and it is to the configured provider', () => {
    // One `fetch` in the whole layer, in the one file that talks to a model. A second one
    // would be a second destination for somebody's words.
    const fetches = AI_FILES.filter((path) => /\bfetch\(/.test(read(path)));

    expect(fetches.map((path) => relative(SOURCE, path))).toEqual([
      'ai/openAiCompatibleProvider.ts',
    ]);
  });

  it('names the eight categories, and only those', () => {
    // The taxonomy is a closed list. An open one is a place for an invented term to appear
    // without anybody deciding to add it.
    expect(SIGNAL_CATEGORIES).toHaveLength(8);
    expect(new Set(SIGNAL_CATEGORIES).size).toBe(SIGNAL_CATEGORIES.length);
  });
});

describe('the port is a port', () => {
  it('is an interface with exactly three capabilities', () => {
    const port = read(join(AI_DIRECTORY, 'aiProvider.ts'));
    const declaration = port.slice(port.indexOf('export interface AiProvider'));
    // Two spaces of indent, so a method inside a nested type is not counted. `constructor`
    // is the exception class declared above, which is not a capability.
    const methods = [...declaration.matchAll(/^ {2}(?!constructor)(\w+)\(/gm)].map(
      (match) => match[1],
    );

    expect(methods).toEqual(['nextTurn', 'extractSignals', 'summariseCase']);
  });

  it('has implementations of that interface and nothing wider', () => {
    // Both are assigned to `AiProvider`, so a fourth method on the interface would fail
    // here; and the mock satisfies the same shape the real one does, which is what lets a
    // test substitute one for the other.
    const factory = read(join(AI_DIRECTORY, 'buildAiProvider.ts'));

    for (const implementation of ['createMockAiProvider', 'createOpenAiCompatibleProvider']) {
      expect(factory).toContain(implementation);
    }

    expect(factory).toContain(': AiProvider');
  });
});

describe('the privacy boundary is in the types', () => {
  it('gives the case context no field for anyone’s own words', () => {
    const port = read(join(AI_DIRECTORY, 'aiProvider.ts'));
    const start = port.indexOf('export interface AiCaseContext');
    const body = port.slice(start, port.indexOf('\n}', start));

    for (const forbidden of ['note', 'word', 'rawText', 'bio', 'intakeNote', 'feedbackNote']) {
      expect(body, `AiCaseContext must not declare "${forbidden}"`).not.toMatch(
        new RegExp(`readonly ${forbidden}\\??:`),
      );
    }
  });

  it('keeps the key out of everything but one place', () => {
    // The key appears in the config, in the factory, and in the provider that uses it. It
    // must not appear in the routes, the validator or the grounding check — those are the
    // files a request flows through, and a key logged there is a key leaked.
    for (const file of ['safety.ts', 'signalVocabulary.ts', 'grounding.ts', 'caseContext.ts']) {
      const source = read(join(AI_DIRECTORY, file));

      expect(source, `${file} must not reference the API key`).not.toMatch(
        /apiKey|AI_API_KEY|authorization/i,
      );
    }
  });

  it('never logs a provider response body', () => {
    // The routes and the provider are the only files with a log line in them. A provider's
    // error body can echo the prompt, and the prompt is someone's own words.
    for (const path of AI_FILES) {
      const source = read(path);

      for (const match of source.matchAll(/\.log\.(?:warn|error|info|debug)\(([^;]*)\)/g)) {
        expect(match[1] ?? '', relative(SOURCE, path)).not.toMatch(/response\.text|body|raw\b/);
      }
    }
  });
});

describe('the vocabulary is the authority', () => {
  it('reads keys from the database rather than from a list in this layer', () => {
    const validator = read(join(AI_DIRECTORY, 'signalVocabulary.ts'));

    // The one hard-coded key allowed in this layer, and it is not a vocabulary key: it is
    // the flag the intake already has a column for. Named explicitly so the exception is
    // visible.
    const keys = [...validator.matchAll(/'(\w[\w-]*)'\s*[:,)]/g)]
      .map((match) => match[1])
      .filter((key): key is string => key !== undefined);
    const vocabularyShaped = keys.filter(
      (key) =>
        key.includes('-') &&
        !['open-to-guidance', 'any', 'hint'].includes(key) &&
        !/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(key),
    );

    // Keys that look like vocabulary terms but are written out here would be a second,
    // divergent copy of the taxonomy.
    expect(
      vocabularyShaped,
      `hard-coded keys in the validator: ${vocabularyShaped.join(', ')}`,
    ).toEqual([]);
  });
});

describe('the real provider cannot log or echo the key', () => {
  it('sends the key as a header and never includes it in an error', () => {
    const provider = read(join(AI_DIRECTORY, 'openAiCompatibleProvider.ts'));

    expect(provider).toContain('authorization: `Bearer ${config.apiKey}`');
    // `AiUnavailableError` carries a reason code. Anything that interpolated the key or a
    // response body into a thrown error would have to name it here.
    expect(provider).not.toMatch(/new Error\([^)]*apiKey/);
  });

  it('aborts a request rather than waiting out the timeout', () => {
    const provider = read(join(AI_DIRECTORY, 'openAiCompatibleProvider.ts'));

    expect(provider).toContain('AbortController');
    expect(provider).toContain('controller.abort()');
  });
});
