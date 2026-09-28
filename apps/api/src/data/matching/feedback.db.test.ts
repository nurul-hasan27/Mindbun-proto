import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createTestPrismaClient } from '../../test/database.js';
import { createPrismaFeedbackRepository } from './prismaFeedbackRepository.js';
import { createPrismaIntakeRepository } from '../intake/prismaIntakeRepository.js';
import { createPrismaMatchRepository } from './prismaMatchRepository.js';
import { createPrismaTherapistRepository } from '../therapists/prismaTherapistRepository.js';
import { requestRematch, recordFeedback } from './feedbackService.js';
import { recommendTherapist } from './matchService.js';
import type { IntakeRequest } from '../intake/intakeTypes.js';

/**
 * Feedback and rematching, against a real PostgreSQL, in the `db` project.
 *
 * The engine's behaviour is covered without a database elsewhere. What cannot be is
 * whether the *history* survives being written — and the history is the claim: that a
 * recommendation offered, the reasons given about it, and the person who came next are
 * all still there, in order, and that pass one is never rewritten.
 *
 *   npm run db:up
 *   npm run test:db
 */

const prisma = createTestPrismaClient();
const matches = createPrismaMatchRepository(prisma);
const feedback = createPrismaFeedbackRepository(prisma);
const therapists = createPrismaTherapistRepository(prisma);
const intakes = createPrismaIntakeRepository(prisma);

/** The demo scenario: Hindi, exploratory, the Indian diaspora, weekday evenings. */
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

async function forget(sessionId: string): Promise<void> {
  const owner = await prisma.client.findUnique({ where: { sessionId }, select: { id: true } });

  if (owner === null) {
    return;
  }

  await prisma.feedbackToReason.deleteMany({
    where: { feedback: { clientId: owner.id } },
  });
  await prisma.feedback.deleteMany({ where: { clientId: owner.id } });
  await prisma.matchEvidence.deleteMany({ where: { match: { clientId: owner.id } } });
  await prisma.match.deleteMany({ where: { clientId: owner.id } });
  await prisma.clientAvailability.deleteMany({ where: { clientId: owner.id } });
  await prisma.clientPreference.deleteMany({ where: { clientId: owner.id } });
  await prisma.intake.deleteMany({ where: { clientId: owner.id } });
  await prisma.client.delete({ where: { id: owner.id } });
}

async function forgetEverything(): Promise<void> {
  await prisma.feedbackToReason.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.matchEvidence.deleteMany();
  await prisma.match.deleteMany();
  await prisma.clientAvailability.deleteMany();
  await prisma.clientPreference.deleteMany();
  await prisma.intake.deleteMany();
  await prisma.client.deleteMany();
}

/** A first recommendation, returned as its id. */
async function firstMatch(intakeId: string): Promise<string> {
  const outcome = await recommendTherapist(intakeId, { matches, therapists });

  if (outcome.kind !== 'found' || outcome.result.kind !== 'recommended') {
    throw new Error(`expected a recommendation, got ${JSON.stringify(outcome)}`);
  }

  return outcome.result.matchId;
}

describe('recording feedback', () => {
  it('stores the reasons, the note, and who it was about', async () => {
    await forgetEverything();
    const { intakeId, clientId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    const outcome = await recordFeedback(
      matchId,
      { reasons: ['communication-mismatch', 'availability-mismatch'] },
      { feedback },
    );

    expect(outcome.kind).toBe('recorded');

    const row = await prisma.feedback.findUniqueOrThrow({
      where: { matchId },
      include: { reasons: { include: { reason: true } } },
    });

    expect(row.clientId).toBe(clientId);
    expect(row.intakeId).toBe(intakeId);
    // The therapist is derived from the match, not from anywhere the caller could
    // influence it.
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(row.therapistId).toBe(match.therapistId);
    expect(row.matchId).toBe(matchId);
    expect(row.reasons.map((entry) => entry.reason.key).sort()).toEqual([
      'availability-mismatch',
      'communication-mismatch',
    ]);

    await forget(sessionId);
  });

  it('stores the optional note, and does not require one', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(
      matchId,
      { reasons: ['other'], rawText: 'I could not say what I wanted to say.' },
      { feedback },
    );

    expect((await prisma.feedback.findUniqueOrThrow({ where: { matchId } })).text).toBe(
      'I could not say what I wanted to say.',
    );

    const second = await submitIntake();
    const secondMatch = await firstMatch(second.intakeId);
    await recordFeedback(secondMatch, { reasons: ['other'] }, { feedback });

    expect(
      (await prisma.feedback.findUniqueOrThrow({ where: { matchId: secondMatch } })).text,
    ).toBeNull();

    await forget(sessionId);
    await forget(second.sessionId);
  });

  it('marks the match as declined in the same transaction', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe(
      'RECOMMENDED',
    );

    await recordFeedback(matchId, { reasons: ['other'] }, { feedback });

    // Both, or neither: a feedback row pointing at a `RECOMMENDED` match would mean
    // someone was told "we'll look again" while the search still saw it as current.
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe(
      'DECLINED',
    );
    expect(await prisma.feedback.count({ where: { matchId } })).toBe(1);

    await forget(sessionId);
  });

  it('writes one row when the same decline arrives twice', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    const first = await recordFeedback(
      matchId,
      { reasons: ['communication-mismatch'] },
      { feedback },
    );
    const second = await recordFeedback(matchId, { reasons: ['language-mismatch'] }, { feedback });

    // A retry is not a second opinion. The first answer stands.
    expect(second.kind).toBe('recorded');
    if (second.kind === 'recorded') {
      expect(second.receipt.feedbackId).toBe(
        first.kind === 'recorded' ? first.receipt.feedbackId : '',
      );
    }

    expect(await prisma.feedback.count({ where: { matchId } })).toBe(1);

    await forget(sessionId);
  });

  it('refuses a reason the vocabulary does not hold', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(matchId, { reasons: ['because-i-said-so'] }, { feedback });

    // Dropped rather than stored, so nothing in the engine has ever heard of the key
    // and no section can later claim we acted on a reason that does not exist.
    const row = await prisma.feedback.findUniqueOrThrow({
      where: { matchId },
      include: { reasons: true },
    });
    expect(row.reasons).toHaveLength(0);

    await forget(sessionId);
  });

  it('does not store a note that is only whitespace', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(matchId, { reasons: ['other'], rawText: '   ' }, { feedback });

    expect((await prisma.feedback.findUniqueOrThrow({ where: { matchId } })).text).toBeNull();

    await forget(sessionId);
  });
});

describe('the matching history', () => {
  it('keeps every pass, in order, and never rewrites the first', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const firstId = await firstMatch(intakeId);
    const firstRow = await prisma.match.findUniqueOrThrow({ where: { id: firstId } });
    const firstEvidence = await prisma.matchEvidence.count({ where: { matchId: firstId } });

    await recordFeedback(firstId, { reasons: ['communication-mismatch'] }, { feedback });

    const outcome = await requestRematch(firstId, { feedback, matches, therapists });

    if (outcome.kind !== 'rematched') {
      throw new Error(`expected a rematch, got ${JSON.stringify(outcome)}`);
    }

    // The first pass is untouched: same status, same score, same evidence count. It is
    // `DECLINED` now only because that is the one transition a match ever makes.
    const after = await prisma.match.findUniqueOrThrow({ where: { id: firstId } });
    expect(after.attempt).toBe(firstRow.attempt);
    expect(after.score).toBe(firstRow.score);
    expect(after.therapistId).toBe(firstRow.therapistId);
    expect(await prisma.matchEvidence.count({ where: { matchId: firstId } })).toBe(firstEvidence);

    // And the new pass exists beside it.
    expect(outcome.attempt).toBe(2);
    expect(outcome.matchId).not.toBe(firstId);

    const history = await prisma.match.findMany({
      where: { intakeId, status: { in: ['RECOMMENDED', 'DECLINED'] } },
      orderBy: { attempt: 'asc' },
      select: { attempt: true, id: true, status: true },
    });

    expect(history).toEqual([
      { attempt: 1, id: firstId, status: 'DECLINED' },
      { attempt: 2, id: outcome.matchId, status: 'RECOMMENDED' },
    ]);

    await forget(sessionId);
  });

  it('records a new candidate set for each pass, under its own attempt number', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const totalTherapists = await prisma.therapist.count();

    const firstId = await firstMatch(intakeId);
    await recordFeedback(firstId, { reasons: ['availability-mismatch'] }, { feedback });
    const outcome = await requestRematch(firstId, { feedback, matches, therapists });

    if (outcome.kind !== 'rematched') {
      throw new Error('expected a rematch');
    }

    for (const attempt of [1, 2]) {
      expect(await prisma.match.count({ where: { intakeId, attempt } })).toBe(totalTherapists);
    }

    await forget(sessionId);
  });

  it('refuses a second evaluation of the same candidate in the same pass', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    await firstMatch(intakeId);

    const existing = await prisma.match.findFirstOrThrow({ where: { intakeId, attempt: 1 } });

    await expect(
      prisma.match.create({
        data: {
          clientId: existing.clientId,
          intakeId,
          therapistId: existing.therapistId,
          attempt: 1,
          engineVersion: 'v1',
          score: 0,
          status: 'ELIGIBLE',
        },
      }),
    ).rejects.toThrow();

    await forget(sessionId);
  });

  it('allows the same therapist in a later pass, because the attempt is part of the key', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    await firstMatch(intakeId);
    const existing = await prisma.match.findFirstOrThrow({ where: { intakeId, attempt: 1 } });

    // The point of the constraint's shape: a candidate may be evaluated again in a
    // later pass, just not twice in one.
    const second = await prisma.match.create({
      data: {
        clientId: existing.clientId,
        intakeId,
        therapistId: existing.therapistId,
        attempt: 2,
        engineVersion: 'v1',
        score: 0,
        status: 'INELIGIBLE',
        rejectionCode: 'DECLINED_PREVIOUSLY',
      },
    });

    expect(second.attempt).toBe(2);

    await forget(sessionId);
  });
});

describe('exclusions, within the journey', () => {
  it('never recommends the same therapist twice in one journey', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const seen = new Set<string>();
    let currentId = await firstMatch(intakeId);
    seen.add(await therapistFor(currentId));

    for (let attempt = 2; attempt <= 4; attempt += 1) {
      await recordFeedback(currentId, { reasons: ['communication-mismatch'] }, { feedback });

      const outcome = await requestRematch(currentId, { feedback, matches, therapists });

      if (outcome.kind !== 'rematched') {
        break;
      }

      const name = await therapistFor(outcome.matchId);
      expect(seen.has(name), `${name} was already recommended`).toBe(false);
      seen.add(name);
      currentId = outcome.matchId;
    }

    expect(seen.size).toBeGreaterThanOrEqual(2);

    await forget(sessionId);
  });

  it('does not exclude a therapist from a different person’s journey', async () => {
    await forgetEverything();
    const first = await submitIntake();
    const second = await submitIntake();

    const firstMatchId = await firstMatch(first.intakeId);
    await recordFeedback(firstMatchId, { reasons: ['communication-mismatch'] }, { feedback });

    // The exclusion is scoped to the intake, so the same therapist is perfectly
    // recommendable to somebody else — nothing about one search follows a person around
    // the service.
    const context = await feedback.loadRematchContext(firstMatchId);
    expect(context?.declinedTherapistIds).toHaveLength(1);

    const secondMatchId = await firstMatch(second.intakeId);
    const secondContext = await feedback.loadRematchContext(secondMatchId);

    expect(secondContext?.declinedTherapistIds).toEqual([]);

    await forget(first.sessionId);
    await forget(second.sessionId);
  });

  it('does not exclude a therapist from the same person on a different intake', async () => {
    await forgetEverything();
    const first = await submitIntake();
    const second = await submitIntake();

    const firstMatchId = await firstMatch(first.intakeId);
    const declinedTherapist = await therapistFor(firstMatchId);

    await recordFeedback(firstMatchId, { reasons: ['communication-mismatch'] }, { feedback });

    const secondMatchId = await firstMatch(second.intakeId);
    expect(await therapistFor(secondMatchId)).toBe(declinedTherapist);

    await forget(first.sessionId);
    await forget(second.sessionId);
  });
});

describe('running out', () => {
  it('answers honestly when there is nobody left, and stores that as a decision', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);
    const declined = await therapistFor(matchId);

    // Mark every other therapist on this intake as already declined, so the next pass
    // has nobody left. Done through the database rather than by shrinking the
    // therapist set, because the real exhausted-pool case is fifty declines.
    const others = await prisma.match.findMany({
      where: { intakeId, attempt: 1, therapistId: { not: declined } },
      select: { id: true },
    });

    for (const row of others) {
      await prisma.match.update({ where: { id: row.id }, data: { status: 'DECLINED' } });
    }

    await recordFeedback(matchId, { reasons: ['other'] }, { feedback });
    const outcome = await requestRematch(matchId, { feedback, matches, therapists });

    expect(outcome.kind).toBe('no-candidate');
    if (outcome.kind === 'no-candidate') {
      expect(outcome.remaining).toBe(0);
    }

    // The pass is still recorded, so "we looked and there was nobody" is a fact rather
    // than a gap in the record.
    expect(await prisma.match.count({ where: { intakeId, attempt: 2 } })).toBeGreaterThan(0);

    await forget(sessionId);
  });
});

describe('reading a pass back after its recommendation was turned down', () => {
  it('still reports who that pass recommended, and its evidence', async () => {
    // The regression this catches. `findRun` looked only for a `RECOMMENDED` row, so
    // once the client had declined that recommendation the pass reported *no*
    // recommendation at all. The next page then lost the name of the person they had
    // come away from and the differences from them — while the evidence sat there
    // unread. A reload of `/recommendation` after a rematch showed the right person
    // with none of the framing that explains why there was a second one.
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    const firstId = await firstMatch(intakeId);
    const beforeDecline = await matches.findRun(intakeId, 1);

    expect(beforeDecline?.recommendation?.matchId).toBe(firstId);

    await recordFeedback(firstId, { reasons: ['communication-mismatch'] }, { feedback });

    const afterDecline = await matches.findRun(intakeId, 1);

    // The same row, read at a later point in its life. `DECLINED` only ever follows
    // `RECOMMENDED`, so this is reading history rather than inferring it.
    expect(afterDecline?.recommendation?.matchId).toBe(firstId);
    expect(afterDecline?.recommendation?.therapistId).toBe(
      beforeDecline?.recommendation?.therapistId,
    );
    expect(afterDecline?.recommendation?.evidence).toEqual(beforeDecline?.recommendation?.evidence);

    await forget(sessionId);
  });

  it('does not mistake a never-recommended pass for one', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();

    // A pass where nothing qualified has no recommendation to report, and must keep
    // saying so rather than naming whichever row happens to be there.
    await firstMatch(intakeId);
    const rows = await prisma.match.findMany({ where: { intakeId, attempt: 1 } });
    await prisma.match.updateMany({
      where: { intakeId, attempt: 1 },
      data: { status: 'INELIGIBLE', rejectionCode: 'NO_SHARED_LANGUAGE' },
    });

    const run = await matches.findRun(intakeId, 1);

    expect(run?.recommendation).toBeNull();
    expect(rows.length).toBeGreaterThan(0);

    await forget(sessionId);
  });
});

describe('foreign keys and cascades', () => {
  it('removes feedback when its match is deleted', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(matchId, { reasons: ['other'] }, { feedback });
    expect(await prisma.feedback.count({ where: { matchId } })).toBe(1);

    await prisma.match.delete({ where: { id: matchId } });

    // And the reasons with it, through the join table.
    expect(await prisma.feedback.count({ where: { matchId } })).toBe(0);
    expect(await prisma.feedbackToReason.count({ where: { feedbackId: matchId } })).toBe(0);

    await forget(sessionId);
  });

  it('removes feedback when the client is deleted', async () => {
    await forgetEverything();
    const { intakeId, clientId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(matchId, { reasons: ['other'] }, { feedback });
    await prisma.client.delete({ where: { id: clientId } });

    expect(await prisma.feedback.count({ where: { clientId } })).toBe(0);
    expect(await prisma.match.count({ where: { clientId } })).toBe(0);

    await forget(sessionId);
  });

  it('refuses a second feedback row for one match', async () => {
    await forgetEverything();
    const { intakeId, clientId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(matchId, { reasons: ['other'] }, { feedback });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });

    await expect(
      prisma.feedback.create({
        data: { matchId, clientId, intakeId, therapistId: match.therapistId },
      }),
    ).rejects.toThrow();

    await forget(sessionId);
  });

  it('removes a reason from a feedback row without removing the feedback', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const matchId = await firstMatch(intakeId);

    await recordFeedback(
      matchId,
      { reasons: ['communication-mismatch', 'availability-mismatch'] },
      { feedback },
    );
    const row = await prisma.feedback.findUniqueOrThrow({ where: { matchId } });
    const link = await prisma.feedbackToReason.findFirstOrThrow({
      where: { feedbackId: row.id },
    });

    await prisma.feedbackToReason.delete({ where: { feedbackId_reasonId: link } });

    // The record survives with one reason fewer. Losing the reasons loses the ability to
    // act on what was said, which is the one thing this row is for.
    expect(await prisma.feedback.count({ where: { matchId } })).toBe(1);
    expect(await prisma.feedbackToReason.count({ where: { feedbackId: row.id } })).toBe(1);

    await forget(sessionId);
  });
});

describe('the API, end to end against a real database', () => {
  it('takes feedback, looks again, and answers with a different person', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const app = buildApp({ matches, feedback, therapists, intakes });

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId },
    });
    const firstBody = first.json<{ matchId: string; therapist: { id: string } }>();

    const declined = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${firstBody.matchId}/feedback`,
      headers: { 'content-type': 'application/json' },
      payload: { reasons: ['communication-mismatch'] },
    });
    expect(declined.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${firstBody.matchId}/rematch`,
    });

    expect(second.statusCode).toBe(200);
    const secondBody = second.json<{
      matchId: string;
      attempt: number;
      previousTherapistName: string;
      therapist: { id: string };
      whyThisMatch: { key: string; sentence: string }[];
      whatChanged: { category: string; sentence: string }[];
    }>();

    expect(secondBody.therapist.id).not.toBe(firstBody.therapist.id);
    expect(secondBody.attempt).toBe(2);
    expect(secondBody.previousTherapistName.length).toBeGreaterThan(0);
    expect(secondBody.whyThisMatch.length).toBeGreaterThan(0);

    // Nothing internal in either body, and one person in each. The rematch names two
    // people — the new one, and the one they are being moved away from — but only one
    // of them is a therapist *object*, so there is still nothing that could be read as
    // a shortlist.
    for (const body of [first.body, second.body]) {
      expect(body).not.toMatch(/"score"|"rejectionCode"|"engineVersion"|"weight"|%/);
      expect(body.match(/"displayName"/g)).toHaveLength(1);
    }

    // The person they came away from is named, by name only.
    expect(second.body).toContain('previousTherapistName');
    expect(second.json<{ previousTherapistName: string }>().previousTherapistName).not.toBe(
      second.json<{ therapist: { displayName: string } }>().therapist.displayName,
    );

    await app.close();
    await forget(sessionId);
  });

  it('gives the same rematch twice, because the engine is deterministic', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const app = buildApp({ matches, feedback, therapists, intakes });

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId },
    });
    const matchId = first.json<{ matchId: string }>().matchId;

    await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${matchId}/feedback`,
      headers: { 'content-type': 'application/json' },
      payload: { reasons: ['communication-mismatch', 'availability-mismatch'] },
    });

    const rematch = await app.inject({ method: 'POST', url: `/api/v1/matches/${matchId}/rematch` });
    const again = await app.inject({ method: 'POST', url: `/api/v1/matches/${matchId}/rematch` });

    // The second call finds a later pass already exists and points at it, rather than
    // searching again — a double click must not skip past a person to the one after them.
    expect(rematch.statusCode).toBe(200);
    expect(again.statusCode).toBe(409);
    expect(await prisma.match.count({ where: { intakeId, status: 'RECOMMENDED' } })).toBe(1);

    await app.close();
    await forget(sessionId);
  });

  it('refuses to look again before a reason has been given', async () => {
    await forgetEverything();
    const { intakeId, sessionId } = await submitIntake();
    const app = buildApp({ matches, feedback, therapists, intakes });

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId },
    });
    const matchId = first.json<{ matchId: string }>().matchId;

    const rematch = await app.inject({ method: 'POST', url: `/api/v1/matches/${matchId}/rematch` });

    expect(rematch.statusCode).toBe(409);
    expect(rematch.json<{ message: string }>().message).toMatch(/tell us what did not fit/i);

    await app.close();
    await forget(sessionId);
  });
});

async function therapistFor(matchId: string): Promise<string> {
  const row = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { therapistId: true },
  });

  return row.therapistId;
}
