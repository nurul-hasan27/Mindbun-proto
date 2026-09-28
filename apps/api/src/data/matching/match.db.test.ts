import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createTestPrismaClient } from '../../test/database.js';
import { createPrismaIntakeRepository } from '../intake/prismaIntakeRepository.js';
import { createPrismaMatchRepository } from './prismaMatchRepository.js';
import { createPrismaTherapistRepository } from '../therapists/prismaTherapistRepository.js';
import { recommendTherapist } from './matchService.js';
import type { IntakeRequest } from '../intake/intakeTypes.js';

/**
 * Persistence, against a real PostgreSQL, in the `db` project.
 *
 * The engine's own behaviour is tested without a database in `matchEngine.test.ts`.
 * What cannot be tested without one is whether the reasoning survives being stored —
 * and that is the whole claim of this phase: that a match made today can still
 * explain itself tomorrow.
 *
 *   npm run db:up
 *   npm run test:db
 */

const prisma = createTestPrismaClient();
const matches = createPrismaMatchRepository(prisma);
const therapists = createPrismaTherapistRepository(prisma);
const intakes = createPrismaIntakeRepository(prisma);

/** The demo scenario: Hindi, exploratory, Indian diaspora, Tuesday evenings. */
const SCENARIO: Omit<IntakeRequest, 'sessionId' | 'submissionId'> = {
  areasOfWork: ['relationships'],
  communicationStyles: ['exploratory'],
  contextualExperiences: ['indian-diaspora'],
  languages: ['hi'],
  sessionFormats: ['online'],
  availability: {
    timezone: 'Asia/Kolkata',
    windows: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 }],
  },
  openToGuidance: false,
  rawText: '',
};

async function submitIntake(
  overrides: Partial<IntakeRequest> = {},
): Promise<{ intakeId: string; clientId: string; sessionId: string }> {
  const sessionId = randomUUID();
  const receipt = await intakes.submit({
    ...SCENARIO,
    sessionId,
    submissionId: randomUUID(),
    ...overrides,
  });

  const intake = await prisma.intake.findUniqueOrThrow({
    where: { id: receipt.intakeId },
    select: { clientId: true },
  });

  return { intakeId: receipt.intakeId, clientId: intake.clientId, sessionId };
}

/** Removes every trace of a session, so tests cannot influence each other. */
async function forget(sessionId: string): Promise<void> {
  const owner = await prisma.client.findUnique({ where: { sessionId }, select: { id: true } });

  if (owner === null) {
    return;
  }

  // Matches go first: they cascade from the intake, but deleting in order keeps
  // the intent obvious and works even if a cascade is ever removed.
  await prisma.matchEvidence.deleteMany({ where: { match: { intake: { clientId: owner.id } } } });
  await prisma.match.deleteMany({ where: { clientId: owner.id } });
  await prisma.clientAvailability.deleteMany({ where: { clientId: owner.id } });
  await prisma.clientPreference.deleteMany({ where: { clientId: owner.id } });
  await prisma.intake.deleteMany({ where: { clientId: owner.id } });
  await prisma.client.delete({ where: { id: owner.id } });
}

async function forgetEverything(): Promise<void> {
  await prisma.matchEvidence.deleteMany();
  await prisma.match.deleteMany();
  await prisma.clientAvailability.deleteMany();
  await prisma.clientPreference.deleteMany();
  await prisma.intake.deleteMany();
  await prisma.client.deleteMany();
}

describe('matching against a real database', () => {
  it('recommends someone for the demo scenario, and says why', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const outcome = await recommendTherapist(intakeId, { matches, therapists });

    expect(outcome.kind).toBe('found');

    if (outcome.kind !== 'found' || outcome.result.kind !== 'recommended') {
      throw new Error(`expected a recommendation, got ${JSON.stringify(outcome)}`);
    }

    // The reasons are the ones the client asked about, in the client's own words.
    const sentences = outcome.result.evidence.map((item) => item.sentence).join(' ');

    expect(sentences).toMatch(/Hindi/i);
    expect(sentences.length).toBeGreaterThan(20);

    // And the therapist really does have those attributes, from the database.
    const profile = outcome.result.therapist;

    expect(profile.languages.map((language) => language.key)).toContain('hi');
    expect(profile.communicationStyles.map((style) => style.key)).toContain('exploratory');
    expect(profile.contextualExperience.map((context) => context.key)).toContain('indian-diaspora');

    await forget(sessionId);
  });

  it('writes one row per candidate, including the ones it set aside', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    await recommendTherapist(intakeId, { matches, therapists });

    const totalTherapists = await prisma.therapist.count();
    const rows = await prisma.match.findMany({ where: { intakeId } });

    expect(rows).toHaveLength(totalTherapists);

    const rejected = rows.filter((row) => row.status === 'INELIGIBLE');

    // A run that only stored the winner would not be inspectable, so the
    // eliminations have to be there with a reason attached.
    expect(rejected.length).toBeGreaterThan(0);

    for (const row of rows) {
      if (row.status === 'INELIGIBLE') {
        expect(row.rejectionCode).not.toBeNull();
        expect(row.score).toBe(0);
      } else {
        expect(row.rejectionCode).toBeNull();
      }
    }

    await forget(sessionId);
  });

  it('recommends exactly one candidate', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    await recommendTherapist(intakeId, { matches, therapists });

    const recommended = await prisma.match.count({ where: { intakeId, status: 'RECOMMENDED' } });

    expect(recommended).toBe(1);

    await forget(sessionId);
  });

  it('stores the engine version on every row, because logic will change', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    await recommendTherapist(intakeId, { matches, therapists });

    const versions = await prisma.match.findMany({
      where: { intakeId },
      select: { engineVersion: true },
    });

    expect(versions.length).toBeGreaterThan(0);

    for (const row of versions) {
      expect(row.engineVersion).toBe('v1');
    }

    await forget(sessionId);
  });

  it('stores evidence that can be read back without touching anything else', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const outcome = await recommendTherapist(intakeId, { matches, therapists });

    if (outcome.kind !== 'found' || outcome.result.kind !== 'recommended') {
      throw new Error('expected a recommendation');
    }

    const rows = await prisma.matchEvidence.findMany({
      where: { matchId: outcome.result.matchId },
      orderBy: { ordinal: 'asc' },
    });

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.clientKey).not.toBe('');
      expect(row.therapistKey).not.toBe('');

      if (row.category === 'AVAILABILITY') {
        // Availability is the only category with a numeric fact, and the columns
        // are filled or empty as a unit so a row is self-describing.
        expect(row.overlapDayOfWeek).not.toBeNull();
        expect(row.overlapStartMinute).not.toBeNull();
        expect(row.overlapEndMinute).not.toBeNull();
        expect(row.therapistOverlapStartMinute).not.toBeNull();
        expect(row.seasonal).toBeGreaterThanOrEqual(1);
      } else {
        expect(row.overlapDayOfWeek).toBeNull();
        expect(row.overlapStartMinute).toBeNull();
        expect(row.overlapEndMinute).toBeNull();
        expect(row.seasonal).toBe(0);
      }
    }

    await forget(sessionId);
  });

  it('stores an overlap in the client own clock, not in anything server-side', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    await recommendTherapist(intakeId, { matches, therapists });

    const rows = await prisma.matchEvidence.findMany({
      where: { match: { intakeId }, category: 'AVAILABILITY' },
    });

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // Every shared slot is a subset of the 17:00–21:00 window the client chose,
      // expressed in minutes from their own midnight.
      expect(row.overlapDayOfWeek).toBe('TUESDAY');
      expect(row.overlapStartMinute).toBeGreaterThanOrEqual(17 * 60);
      expect(row.overlapEndMinute).toBeLessThanOrEqual(21 * 60);
      // And the same instant on the therapist's clock is stored beside it, so the
      // record explains both sides without re-deriving anything.
      expect(row.therapistOverlapStartMinute).not.toBeNull();
      expect(row.therapistOverlapEndMinute).not.toBeNull();
    }

    await forget(sessionId);
  });

  it('reads a stored overlap back through the port unchanged', async () => {
    await forgetEverything();

    // A language few therapists speak, chosen so that the recommendation is likely
    // to share the requested evening — the point of the test is the round trip, not
    // who wins.
    const { intakeId, sessionId } = await submitIntake({
      availability: {
        timezone: 'Asia/Kolkata',
        windows: [
          { dayOfWeek: 'MONDAY', startMinute: 1020, endMinute: 1260 },
          { dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 },
          { dayOfWeek: 'WEDNESDAY', startMinute: 1020, endMinute: 1260 },
          { dayOfWeek: 'THURSDAY', startMinute: 1020, endMinute: 1260 },
          { dayOfWeek: 'FRIDAY', startMinute: 1020, endMinute: 1260 },
        ],
      },
    });

    await recommendTherapist(intakeId, { matches, therapists });

    const run = await matches.findRun(intakeId, 1);
    const availability =
      run?.recommendation?.evidence.filter((item) => item.category === 'AVAILABILITY') ?? [];

    expect(availability.length).toBeGreaterThan(0);

    for (const item of availability) {
      expect(item.overlap).toBeDefined();
      expect(item.overlap?.startMinute).toBeGreaterThanOrEqual(17 * 60);
      expect(item.overlap?.endMinute).toBeLessThanOrEqual(21 * 60);
      // The season flag survives as information rather than being flattened away.
      expect(item.overlap?.weeks.length).toBeGreaterThan(0);
    }

    await forget(sessionId);
  });
});

describe('evaluating an intake once', () => {
  it('returns the stored decision on a second request', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const first = await recommendTherapist(intakeId, { matches, therapists });
    const second = await recommendTherapist(intakeId, { matches, therapists });

    if (
      first.kind !== 'found' ||
      first.result.kind !== 'recommended' ||
      second.kind !== 'found' ||
      second.result.kind !== 'recommended'
    ) {
      throw new Error('expected two recommendations');
    }

    expect(second.result.matchId).toBe(first.result.matchId);
    expect(second.result.decidedAt).toBe(first.result.decidedAt);
    expect(second.result.therapist.id).toBe(first.result.therapist.id);

    await forget(sessionId);
  });

  it('writes no second set of rows', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const totalTherapists = await prisma.therapist.count();

    await recommendTherapist(intakeId, { matches, therapists });
    const afterFirst = await prisma.match.count({ where: { intakeId } });

    await recommendTherapist(intakeId, { matches, therapists });
    await recommendTherapist(intakeId, { matches, therapists });

    expect(await prisma.match.count({ where: { intakeId } })).toBe(afterFirst);
    expect(afterFirst).toBe(totalTherapists);

    await forget(sessionId);
  });

  it('gives the same answer when three requests arrive at once', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const results = await Promise.all([
      recommendTherapist(intakeId, { matches, therapists }),
      recommendTherapist(intakeId, { matches, therapists }),
      recommendTherapist(intakeId, { matches, therapists }),
    ]);

    const ids = results.flatMap((result) =>
      result.kind === 'found' && result.result.kind === 'recommended'
        ? [result.result.matchId]
        : [],
    );

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.match.count({ where: { intakeId, status: 'RECOMMENDED' } })).toBe(1);

    await forget(sessionId);
  });

  it('explains an older intake by its own answers, not by the newer ones', async () => {
    await forgetEverything();
    const sessionId = randomUUID();

    // Two submissions in the same session. The second replaces the client's single
    // preference set, so the first intake's answers exist only if they were linked
    // to it when it was stored.
    const first = await intakes.submit({ ...SCENARIO, sessionId, submissionId: randomUUID() });
    const second = await intakes.submit({
      ...SCENARIO,
      sessionId,
      submissionId: randomUUID(),
      areasOfWork: ['burnout'],
      languages: ['ta'],
    });

    const linked = await prisma.clientPreference.findMany({
      where: { client: { sessionId } },
      orderBy: { createdAt: 'desc' },
      select: { intakeId: true },
    });

    // The set that replaced the earlier one is linked to the later intake, and the
    // earlier intake keeps its own answers.
    expect(linked.map((row) => row.intakeId)).toEqual([second.intakeId]);

    const outcome = await recommendTherapist(first.intakeId, { matches, therapists });

    expect(outcome.kind).toBe('found');

    if (outcome.kind !== 'found' || outcome.result.kind !== 'recommended') {
      throw new Error('expected a recommendation for the earlier intake');
    }

    // Tamil was asked for in the *second* intake only, so it must not appear in the
    // first one's explanation.
    const sentences = outcome.result.evidence.map((item) => item.sentence).join(' ');
    expect(sentences).not.toMatch(/Tamil/i);

    await forget(sessionId);
  });

  it('reports an intake it has never seen, without writing anything', async () => {
    const outcome = await recommendTherapist(randomUUID(), { matches, therapists });

    expect(outcome.kind).toBe('unknown-intake');
  });
});

describe('when nothing qualifies', () => {
  it('stores the run anyway, because "none of them fit" is a decision', async () => {
    await forgetEverything();

    // A language the service lists and no therapist currently speaks, so every
    // candidate is eliminated by the language requirement.
    const { intakeId: impossible, sessionId: impossibleSession } = await submitIntake({
      languages: ['af'],
    });

    const outcome = await recommendTherapist(impossible, { matches, therapists });

    if (outcome.kind !== 'found' || outcome.result.kind !== 'no-candidate') {
      throw new Error(`expected no candidate, got ${JSON.stringify(outcome)}`);
    }

    expect(outcome.result.considered).toBe(await prisma.therapist.count());
    expect(await prisma.match.count({ where: { intakeId: impossible } })).toBeGreaterThan(0);
    expect(
      await prisma.match.count({ where: { intakeId: impossible, status: 'RECOMMENDED' } }),
    ).toBe(0);

    // And a second request is still the same answer, not a fresh search.
    const again = await recommendTherapist(impossible, { matches, therapists });

    expect(again.kind).toBe('found');

    if (again.kind !== 'found') {
      throw new Error('expected a stored answer');
    }

    expect(again.result.kind).toBe('no-candidate');

    await forget(impossibleSession);
  });
});

describe('the API against a real database', () => {
  it('answers end to end, from an intake to a recommendation', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const app = buildApp({ matches, therapists, intakes });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      matchId: string;
      therapist: { displayName: string; id: string };
      whyThisMatch: { key: string; sentence: string }[];
    }>();

    expect(body.matchId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.therapist.displayName.length).toBeGreaterThan(0);
    expect(body.whyThisMatch.length).toBeGreaterThan(0);

    // Nothing the engine knows internally, and nobody else, is in the body.
    expect(response.body).not.toMatch(/"score"|"rejectionCode"|"engineVersion"|"considered"/);
    expect(response.body.match(/"displayName"/g)).toHaveLength(1);

    await app.close();
    await forget(sessionId);
  });

  it('reads the same recommendation again on a retry', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const app = buildApp({ matches, therapists, intakes });

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId },
    });
    const retry = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId },
    });

    expect(retry.json<{ matchId: string }>().matchId).toBe(
      first.json<{ matchId: string }>().matchId,
    );

    await app.close();
    await forget(sessionId);
  });
});

describe('foreign keys and cascades', () => {
  it('removes a run when its intake is deleted', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    await recommendFor(intakeId);

    const before = await prisma.match.count({ where: { intakeId } });
    expect(before).toBeGreaterThan(0);

    await prisma.intake.delete({ where: { id: intakeId } });

    expect(await prisma.match.count({ where: { intakeId } })).toBe(0);
    expect(await prisma.matchEvidence.count({ where: { match: { intakeId } } })).toBe(0);

    await forget(sessionId);
  });

  it('removes a run when its client is deleted', async () => {
    await forgetEverything();
    const { intakeId, clientId, sessionId } = await submitIntake();
    await recommendFor(intakeId);

    await prisma.client.delete({ where: { id: clientId } });

    expect(await prisma.match.count({ where: { clientId } })).toBe(0);

    await forget(sessionId);
  });

  it('removes evidence when its match is deleted', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    await recommendFor(intakeId);

    const match = await prisma.match.findFirstOrThrow({ where: { intakeId } });
    await prisma.match.delete({ where: { id: match.id } });

    expect(await prisma.matchEvidence.count({ where: { matchId: match.id } })).toBe(0);

    await forget(sessionId);
  });

  it('refuses a second evaluation of the same candidate for one intake', async () => {
    await forgetEverything();
    const { intakeId, clientId, sessionId } = await submitIntake();
    await recommendFor(intakeId);

    const existing = await prisma.match.findFirstOrThrow({ where: { intakeId } });

    await expect(
      prisma.match.create({
        data: {
          clientId,
          intakeId,
          therapistId: existing.therapistId,
          engineVersion: 'v1',
          score: 0,
          status: 'ELIGIBLE',
        },
      }),
    ).rejects.toThrow();

    await forget(sessionId);
  });
});

/** Shorthand used above, kept out of the test bodies for readability. */
async function recommendFor(intakeId: string): Promise<void> {
  await recommendTherapist(intakeId, { matches, therapists });
}
