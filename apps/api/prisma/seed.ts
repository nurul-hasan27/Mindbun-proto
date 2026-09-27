/**
 * Deterministic synthetic seed.
 *
 * Run with `npm run db:seed` (or `prisma migrate reset`, which runs it for you).
 * Running it twice produces the same 50 therapists: the same people, the same
 * structured attributes, the same availability. That matters because future
 * phases will write tests against this data, and a test that passes on Tuesday
 * and fails on Wednesday because the seed shuffled is worse than no test.
 *
 * Every therapist here is invented. Nothing is copied from a directory or a
 * website, and no data is scraped.
 *
 * Idempotent by construction: the seed deletes the domain tables and rebuilds
 * them, so there is no path by which running it twice duplicates a record.
 */

import { createPrismaClient } from '../src/lib/prisma.js';
import { assertValidProfileDraft } from '../src/data/therapists/profileDraft.js';
import {
  regionPresetsByKey,
  type AvailabilityTemplate,
  type RegionPreset,
} from './data/regions.js';
import { therapistSeeds, type TherapistSeed } from './data/therapists.js';
import {
  areasOfWork,
  communicationStyles,
  contextualExperience,
  feedbackReasons,
  languages,
  sessionFormats,
  therapeuticApproaches,
  type SimpleEntry,
  type VocabularyEntry,
} from './data/vocabularies.js';
import type { DayOfWeek, PrismaClient } from '../src/generated/prisma/client.js';

const prisma = createPrismaClient(process.env['DATABASE_URL'] ?? '');

/**
 * A tiny deterministic PRNG (mulberry32). Chosen because it is four lines, has
 * no dependencies, and produces the same sequence on every platform — which is
 * the entire point of seeding a prototype.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20_260_301;

function pick<T>(random: () => number, values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error('Cannot pick from an empty list.');
  }
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) {
    throw new Error('Pick returned undefined.');
  }
  return value;
}

/**
 * Draws `count` distinct values, taking from the bias list first so that a
 * region stays recognisable, then topping up from the whole vocabulary.
 */
function pickDistinct(
  random: () => number,
  bias: readonly string[],
  all: readonly string[],
  count: number,
): string[] {
  const chosen = new Set<string>();
  const limit = Math.min(count, all.length);

  for (const key of bias) {
    if (chosen.size >= limit) break;
    chosen.add(key);
  }

  const remaining = all.filter((key) => !chosen.has(key));
  while (chosen.size < limit && remaining.length > 0) {
    chosen.add(pick(random, remaining));
  }

  return [...chosen];
}

/** Two or three windows, with no two on the same weekday. */
function pickAvailability(random: () => number, region: RegionPreset): AvailabilityTemplate[] {
  const candidates = [...region.windows];
  const chosen: AvailabilityTemplate[] = [];

  const wanted = 2 + (random() < 0.45 ? 1 : 0);
  while (chosen.length < wanted && candidates.length > 0) {
    const index = Math.floor(random() * candidates.length);
    const [window] = candidates.splice(index, 1);
    if (window !== undefined) {
      chosen.push(window);
    }
  }

  return chosen.sort(
    (a, b) => a.dayOfWeek.localeCompare(b.dayOfWeek) || a.startMinute - b.startMinute,
  );
}

function pickFormats(random: () => number): string[] {
  const formatKeys = sessionFormats.map((format) => format.key);
  // Online is the norm; in-person is the variation. Both appear.
  const wantsInPerson = random() < 0.45;
  return wantsInPerson ? [...formatKeys] : [formatKeys[0] ?? 'online'];
}

function regionFor(seed: TherapistSeed): RegionPreset {
  const region = regionPresetsByKey.get(seed.region);
  if (region === undefined) {
    throw new Error(`Unknown region "${seed.region}" for ${seed.displayName}.`);
  }
  return region;
}

interface VocabularyIds {
  readonly languages: ReadonlyMap<string, string>;
  readonly approaches: ReadonlyMap<string, string>;
  readonly styles: ReadonlyMap<string, string>;
  readonly areas: ReadonlyMap<string, string>;
  readonly contexts: ReadonlyMap<string, string>;
  readonly formats: ReadonlyMap<string, string>;
}

async function upsertVocabularies(client: PrismaClient): Promise<VocabularyIds> {
  const ids: {
    languages: Map<string, string>;
    approaches: Map<string, string>;
    styles: Map<string, string>;
    areas: Map<string, string>;
    contexts: Map<string, string>;
    formats: Map<string, string>;
  } = {
    languages: new Map(),
    approaches: new Map(),
    styles: new Map(),
    areas: new Map(),
    contexts: new Map(),
    formats: new Map(),
  };

  const write = async (
    model: { upsert: (args: never) => Promise<{ id: string }> },
    table: Map<string, string>,
    entries: readonly VocabularyEntry[],
  ): Promise<void> => {
    for (const entry of entries) {
      const row = await model.upsert({
        where: { key: entry.key },
        update: { name: entry.name, description: entry.description },
        create: { key: entry.key, name: entry.name, description: entry.description },
      } as never);
      table.set(entry.key, row.id);
    }
  };

  /** Session formats have no description: "Online" needs none. */
  const writeSimple = async (
    model: { upsert: (args: never) => Promise<{ id: string }> },
    table: Map<string, string>,
    entries: readonly SimpleEntry[],
  ): Promise<void> => {
    for (const entry of entries) {
      const row = await model.upsert({
        where: { key: entry.key },
        update: { name: entry.name },
        create: { key: entry.key, name: entry.name },
      } as never);
      table.set(entry.key, row.id);
    }
  };

  // Languages are keyed by their ISO code rather than a separate `key`.
  for (const language of languages) {
    const row = await client.language.upsert({
      where: { code: language.code },
      update: { name: language.name },
      create: { code: language.code, name: language.name },
    });
    ids.languages.set(language.code, row.id);
  }

  const simple = {
    therapeuticApproach: client.therapeuticApproach,
    areaOfWork: client.areaOfWork,
    communicationStyle: client.communicationStyle,
    contextualExperience: client.contextualExperience,
    sessionFormat: client.sessionFormat,
  } as const;

  await write(simple.therapeuticApproach, ids.approaches, therapeuticApproaches);
  await write(simple.areaOfWork, ids.areas, areasOfWork);
  await write(simple.communicationStyle, ids.styles, communicationStyles);
  await write(simple.contextualExperience, ids.contexts, contextualExperience);
  await writeSimple(simple.sessionFormat, ids.formats, sessionFormats);

  for (const reason of feedbackReasons) {
    await client.feedbackReason.upsert({
      where: { key: reason.key },
      update: { name: reason.name, description: reason.description },
      create: { key: reason.key, name: reason.name, description: reason.description },
    });
  }

  return ids;
}

/** Wipes the domain tables, in an order foreign keys are happy with. */
async function resetDomainData(client: PrismaClient): Promise<void> {
  await client.feedback.deleteMany();
  await client.intake.deleteMany();
  await client.clientAvailability.deleteMany();
  await client.clientPreference.deleteMany();
  await client.availabilityWindow.deleteMany();
  await client.therapistProfile.deleteMany();
  await client.therapist.deleteMany();
  await client.client.deleteMany();
}

function requireId(ids: ReadonlyMap<string, string>, key: string, kind: string): string {
  const id = ids.get(key);
  if (id === undefined) {
    throw new Error(`No ${kind} was seeded for "${key}".`);
  }
  return id;
}

async function seedTherapists(
  client: PrismaClient,
  ids: VocabularyIds,
  random: () => number,
): Promise<number> {
  const allApproaches = therapeuticApproaches.map((entry) => entry.key);
  const allStyles = communicationStyles.map((entry) => entry.key);
  const allAreas = areasOfWork.map((entry) => entry.key);
  const allContexts = contextualExperience.map((entry) => entry.key);

  for (const seed of therapistSeeds) {
    const region = regionFor(seed);
    const [location] = region.locations;
    if (location === undefined) {
      throw new Error(`Region "${region.key}" has no locations.`);
    }

    // English is the common language of this dataset; regions add their own.
    const languageCodes = ['en', ...region.extraLanguages].slice(0, 2 + (random() < 0.4 ? 1 : 0));
    const availability = pickAvailability(random, region);

    // The database will not stop a profile with an empty biography or a window
    // that ends before it starts, so the rules are applied here, before writing.
    assertValidProfileDraft({
      displayName: seed.displayName,
      headline: seed.headline,
      bio: seed.bio,
      location,
      timezone: region.timezone,
      yearsOfExperience: seed.yearsOfExperience,
      availability,
    });

    await client.therapist.create({
      data: {
        profile: {
          create: {
            displayName: seed.displayName,
            headline: seed.headline,
            bio: seed.bio,
            location,
            timezone: region.timezone,
            yearsOfExperience: seed.yearsOfExperience,
            languages: {
              connect: languageCodes.map((code) => ({
                id: requireId(ids.languages, code, 'language'),
              })),
            },
            approaches: {
              connect: pickDistinct(
                random,
                region.approachBias,
                allApproaches,
                2 + (random() < 0.5 ? 1 : 0),
              ).map((key) => ({ id: requireId(ids.approaches, key, 'approach') })),
            },
            areasOfWork: {
              connect: pickDistinct(
                random,
                region.areaBias,
                allAreas,
                2 + (random() < 0.6 ? 1 : 0),
              ).map((key) => ({ id: requireId(ids.areas, key, 'area of work') })),
            },
            communicationStyles: {
              connect: pickDistinct(
                random,
                region.styleBias,
                allStyles,
                2 + (random() < 0.4 ? 1 : 0),
              ).map((key) => ({ id: requireId(ids.styles, key, 'communication style') })),
            },
            // Contextual experience is always stated, never inferred: most
            // therapists have some, and a few deliberately have none.
            contextualExperience: {
              connect:
                random() < 0.15
                  ? []
                  : pickDistinct(
                      random,
                      region.contextBias,
                      allContexts,
                      1 + (random() < 0.5 ? 1 : 0),
                    ).map((key) => ({ id: requireId(ids.contexts, key, 'contextual experience') })),
            },
            sessionFormats: {
              connect: pickFormats(random).map((key) => ({
                id: requireId(ids.formats, key, 'session format'),
              })),
            },
            availability: {
              create: availability.map((window) => ({
                dayOfWeek: window.dayOfWeek as DayOfWeek,
                startMinute: window.startMinute,
                endMinute: window.endMinute,
              })),
            },
          },
        },
      },
    });
  }

  return therapistSeeds.length;
}

async function report(client: PrismaClient): Promise<void> {
  const [therapists, profiles, languages, windows, contexts] = await Promise.all([
    client.therapist.count(),
    client.therapistProfile.count(),
    client.language.count(),
    client.availabilityWindow.count(),
    client.contextualExperience.count(),
  ]);

  const timezones = await client.therapistProfile.groupBy({ by: ['timezone'], _count: true });
  const attributes = await client.therapistProfile.findMany({
    select: {
      sessionFormats: { select: { key: true } },
      contextualExperience: { select: { id: true } },
    },
  });
  const onlineOnly = attributes.filter(
    (row) => row.sessionFormats.length === 1 && row.sessionFormats[0]?.key === 'online',
  ).length;
  const withoutContext = attributes.filter((row) => row.contextualExperience.length === 0).length;

  console.log('Seeded:');
  console.log(`  therapists            ${therapists}`);
  console.log(`  profiles              ${profiles}`);
  console.log(`  languages             ${languages}`);
  console.log(`  areas of work         ${areasOfWork.length}`);
  console.log(`  approaches            ${therapeuticApproaches.length}`);
  console.log(`  communication styles  ${communicationStyles.length}`);
  console.log(`  contexts              ${contexts}`);
  console.log(`  availability windows  ${windows}`);
  console.log(`  timezones covered     ${timezones.length}`);
  console.log(`  online-only profiles  ${onlineOnly}`);
  console.log(`  profiles with no stated context  ${withoutContext}`);
}

async function main(): Promise<void> {
  const client = prisma;
  const random = createRandom(SEED);

  await resetDomainData(client);
  console.log('Cleared existing data.');

  const ids = await upsertVocabularies(client);
  console.log('Seeded vocabularies.');

  const count = await seedTherapists(client, ids, random);
  console.log(`Seeded ${count} therapists.`);

  await report(client);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
