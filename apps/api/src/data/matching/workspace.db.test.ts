import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createTestPrismaClient } from '../../test/database.js';
import { createPrismaFeedbackRepository } from './prismaFeedbackRepository.js';
import { createPrismaIntakeRepository } from '../intake/prismaIntakeRepository.js';
import { createPrismaMatchRepository } from './prismaMatchRepository.js';
import { createPrismaTherapistRepository } from '../therapists/prismaTherapistRepository.js';
import { createPrismaWorkspaceRepository } from './prismaWorkspaceRepository.js';
import { recordFeedback, requestRematch } from './feedbackService.js';
import { recommendTherapist } from './matchService.js';
import { decide, findCase, listCases } from './workspaceService.js';
import type { IntakeRequest } from '../intake/intakeTypes.js';
import type { WorkspaceDeps } from './workspaceService.js';

/**
 * The human decision, against a real PostgreSQL, in the `db` project.
 *
 * The decision logic is covered without a database in `workspace.test.ts` and
 * `workspace.test.ts`'s sibling route tests. What cannot be covered there is the claim the
 * whole phase rests on: **that nothing overwrites the engine.**
 *
 *   npm run db:up
 *   npm run test:db
 *
 * So this file is mostly read-back. A matcher chooses a different person, and then every
 * one of these asks the database what is now true — the engine's row, the decision, the
 * client's view, the earlier passes, the declined therapists — rather than asking the code
 * that just wrote them. A service that wrote the right row and a database that stored a
 * different one would pass every other test in the project.
 */

const prisma = createTestPrismaClient();
const matches = createPrismaMatchRepository(prisma);
const feedback = createPrismaFeedbackRepository(prisma);
const therapists = createPrismaTherapistRepository(prisma);
const intakes = createPrismaIntakeRepository(prisma);
const workspace = createPrismaWorkspaceRepository(prisma);

/**
 * The feedback store is here for its vocabulary, so the timeline can show the client's
 * reasons in words. A real Prisma repository, because the reason names come from the same
 * seeded table the journey keys reference — a fixture that resolved them itself would pass
 * whether or not the lookup worked.
 */
const deps: WorkspaceDeps = { workspace, matches, therapists, feedback };

/**
 * The demo scenario: Hindi, exploratory, the Indian diaspora, weekday evenings.
 *
 * Chosen because the seeded pool has several therapists who satisfy it, so a matcher has a
 * real choice to make rather than a formality.
 */
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
  rawText: 'I have been in the UK for six years and keep explaining my family to strangers.',
};

/**
 * The first candidate a matcher could actually choose.
 *
 * A failing test that says "expected an eligible alternative, found none" is far more
 * useful than a crash on `undefined`, and the demo scenario is supposed to always leave
 * one — so a failure here means the seed stopped satisfying it, which is worth knowing.
 */
/** The last candidate, whatever its standing. */
function lastOf<T>(alternatives: readonly T[]): T {
  if (alternatives.length === 0) {
    throw new Error('this pass produced no other candidates at all');
  }

  return alternatives[alternatives.length - 1] as T;
}

/**
 * The pass's own recommendation, which is the only row a client was shown and the only row
 * feedback is filed against.
 *
 * Every pass writes one row per candidate in the pool, so an unqualified `findFirst` returns
 * whichever the database reaches first — an `ELIGIBLE` row nobody was ever shown. Feedback
 * against that is refused, the pass never becomes `DECLINED`, and the queue goes on listing
 * a case the client has already moved past.
 */
async function recommendedOf(
  intakeId: string,
  attempt: number,
): Promise<{ id: string; therapistId: string }> {
  return prisma.match.findFirstOrThrow({
    where: { intakeId, attempt, status: 'RECOMMENDED' },
    select: { id: true, therapistId: true },
  });
}

/** The queue entry for a case, or a failure that says which case was missing. */
function entryFor<T extends { matchId: string }>(queue: readonly T[], matchId: string): T {
  const found = queue.find((entry) => entry.matchId === matchId);

  if (found === undefined) {
    throw new Error(`${matchId} is not in the queue`);
  }

  return found;
}

function firstEligible<T extends { eligible: boolean }>(alternatives: readonly T[]): T {
  const found = alternatives.find((entry) => entry.eligible);

  if (found === undefined) {
    throw new Error('this intake produced no eligible alternative to choose');
  }

  return found;
}

async function submitIntake(
  overrides: Partial<IntakeRequest> = {},
): Promise<{ intakeId: string; clientId: string }> {
  const receipt = await intakes.submit({
    ...SCENARIO,
    sessionId: randomUUID(),
    submissionId: randomUUID(),
    ...overrides,
  });

  const intake = await prisma.intake.findUniqueOrThrow({
    where: { id: receipt.intakeId },
    select: { clientId: true },
  });

  return { intakeId: receipt.intakeId, clientId: intake.clientId };
}

/** A first pass, and the engine's own recommendation for it. */
async function matchedIntake(overrides: Partial<IntakeRequest> = {}): Promise<{
  intakeId: string;
  clientId: string;
  matchId: string;
  suggestedTherapistId: string;
  alternatives: { matchId: string; therapistId: string; eligible: boolean }[];
}> {
  const { intakeId, clientId } = await submitIntake(overrides);
  const outcome = await recommendTherapist(intakeId, { matches, therapists, feedback, workspace });

  if (outcome.kind !== 'found') {
    throw new Error(`expected a known intake, got ${outcome.kind}`);
  }

  const { result } = outcome;

  if (result.kind !== 'recommended') {
    throw new Error(`expected a recommendation, got ${result.kind}`);
  }

  const recommended = result;
  const record = await workspace.findCase(recommended.matchId);
  const suggestion = record?.candidates.find((entry) => entry.matchId === recommended.matchId);

  if (record === null || record === undefined || suggestion === undefined) {
    throw new Error('the pass produced no case to review');
  }

  return {
    intakeId,
    clientId,
    matchId: recommended.matchId,
    suggestedTherapistId: suggestion.therapistId,
    alternatives: record.candidates
      .filter((entry) => entry.matchId !== recommended.matchId)
      .map((entry) => ({
        matchId: entry.matchId,
        therapistId: entry.therapistId,
        eligible: entry.eligible,
      })),
  };
}

/** What is stored for one pass, read straight from the database. */
async function readPass(matchId: string) {
  return prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      id: true,
      attempt: true,
      status: true,
      score: true,
      therapistId: true,
      engineVersion: true,
      evidence: { select: { category: true, therapistKey: true }, orderBy: { ordinal: 'asc' } },
      reviewedAsCase: {
        select: {
          id: true,
          selectedMatchId: true,
          decisionType: true,
          note: true,
          createdAt: true,
          selectedMatch: { select: { therapistId: true, score: true, status: true } },
        },
      },
    },
  });
}

describe('the audit trail the phase exists to keep', () => {
  it('keeps the engine, the human and the client as three separate facts when they disagree', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    expect(alternative.therapistId).not.toBe(before.suggestedTherapistId);

    // 1. The system recommended A.
    expect(before.suggestedTherapistId).toBeTruthy();
    const engineBefore = await readPass(before.matchId);
    expect(engineBefore.status).toBe('RECOMMENDED');
    expect(engineBefore.therapistId).toBe(before.suggestedTherapistId);
    expect(engineBefore.reviewedAsCase).toBeNull();

    // 2. A human chose B, and said why.
    const outcome = await decide(
      before.matchId,
      {
        selectedMatchId: alternative.matchId,
        reasons: ['stronger-contextual-experience'],
        note: 'Aditi has lived it rather than studied it.',
      },
      deps,
    );

    expect(outcome).toMatchObject({
      kind: 'decided',
      decisionType: 'HUMAN_SELECTED_ALTERNATIVE',
      differs: true,
    });

    // 3. Nothing overwrote A. The engine's row is byte-for-byte what it was.
    const engineAfter = await readPass(before.matchId);
    expect(engineAfter.therapistId).toBe(engineBefore.therapistId);
    expect(engineAfter.score).toBe(engineBefore.score);
    expect(engineAfter.status).toBe('RECOMMENDED');
    expect(engineAfter.engineVersion).toBe(engineBefore.engineVersion);
    expect(engineAfter.evidence).toEqual(engineBefore.evidence);

    // 4. The human decision is a new record beside it, pointing at the candidate row.
    expect(engineAfter.reviewedAsCase).not.toBeNull();
    expect(engineAfter.reviewedAsCase?.decisionType).toBe('HUMAN_SELECTED_ALTERNATIVE');
    expect(engineAfter.reviewedAsCase?.selectedMatchId).toBe(alternative.matchId);
    expect(engineAfter.reviewedAsCase?.selectedMatch.therapistId).toBe(alternative.therapistId);
    expect(engineAfter.reviewedAsCase?.note).toBe('Aditi has lived it rather than studied it.');

    // The selected candidate's own row is untouched: still `ELIGIBLE`, still carrying the
    // engine's own score. B was never promoted into A's place, so nothing in the data
    // pretends the algorithm chose B.
    const selected = await readPass(alternative.matchId);
    expect(selected.status).toBe('ELIGIBLE');
    expect(selected.score).toBeGreaterThan(0);

    const selectedDecision = await prisma.matchingDecision.findUniqueOrThrow({
      where: { selectedMatchId: alternative.matchId },
      select: { matchId: true, selectedMatchId: true },
    });
    expect(selectedDecision.matchId).toBe(before.matchId);
    expect(selectedDecision.selectedMatchId).toBe(alternative.matchId);

    // 6. The client is shown B.
    const clientView = await recommendTherapist(before.intakeId, {
      matches,
      therapists,
      feedback,
      workspace,
    });

    const shown = clientView.kind === 'found' ? clientView.result : null;
    expect(shown?.kind).toBe('recommended');

    if (shown?.kind === 'recommended') {
      expect(shown.therapist.id).toBe(alternative.therapistId);
      // The case is still the case, so feedback is filed against the thing a matcher
      // actually reviewed.
      expect(shown.matchId).toBe(before.matchId);
    }

    // 7. And the reasons the client reads belong to B, not to A. A page that paired one
    //    person with another's evidence would contradict itself in front of the person
    //    least able to check it.
    const presentedEvidence = await prisma.matchEvidence.findMany({
      where: { matchId: alternative.matchId },
      select: { explanation: true },
      orderBy: { ordinal: 'asc' },
    });
    const reasons = shown?.kind === 'recommended' ? shown.evidence : [];
    expect(reasons.length).toBeGreaterThan(0);

    // Every sentence on the client's page traces to an evidence row belonging to the
    // person being shown. A page that paired B's name with A's reasons would still render
    // perfectly, and would be the most serious thing this phase could get wrong.
    for (const reason of reasons) {
      const supported = presentedEvidence.some((row) => row.explanation === reason.key);
      expect(supported, `"${reason.sentence}" is not evidence for the therapist being shown`).toBe(
        true,
      );
    }

    // And the ones belonging to the engine's suggestion are not on the page at all, which
    // is only observable if the two candidates have some reason in common to be confused
    // about. Language, in this scenario: both speak Hindi, so the sentences would look
    // right either way. This asserts the swap really happened rather than looking identical.
    const engineOnly = await prisma.matchEvidence.findMany({
      where: { matchId: before.matchId, explanation: { notIn: reasons.map((r) => r.key) } },
      select: { explanation: true },
    });

    expect(engineOnly.length).toBeGreaterThan(0);
  });

  it('records an acceptance as the same row, so keeping the suggestion is not an override', async () => {
    const before = await matchedIntake();
    const outcome = await decide(
      before.matchId,
      { selectedMatchId: before.matchId, reasons: [] },
      deps,
    );

    expect(outcome).toMatchObject({
      kind: 'decided',
      decisionType: 'SYSTEM_ACCEPTED',
      differs: false,
    });

    const pass = await readPass(before.matchId);
    expect(pass.reviewedAsCase?.selectedMatchId).toBe(before.matchId);
    expect(pass.reviewedAsCase?.selectedMatch.therapistId).toBe(before.suggestedTherapistId);

    // The client is shown the same person either way, which is the property that lets
    // "reviewed" be a state without changing anything about what the client sees.
    const clientView = await recommendTherapist(before.intakeId, {
      matches,
      therapists,
      feedback,
      workspace,
    });

    const viewed = clientView.kind === 'found' ? clientView.result : null;
    expect(viewed?.kind === 'recommended' && viewed.therapist.id).toBe(before.suggestedTherapistId);
  });
});

describe('the decision record', () => {
  it('stores reasons as stable keys, and the wording beside them', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    await decide(
      before.matchId,
      {
        selectedMatchId: alternative.matchId,
        reasons: ['better-communication-style', 'stronger-contextual-experience', 'other'],
      },
      deps,
    );

    const stored = await prisma.matchingDecision.findUniqueOrThrow({
      where: { matchId: before.matchId },
      select: { reasons: { select: { reason: { select: { key: true, name: true } } } } },
    });

    // Keys, not sentences: a copywriter can rewrite a name without touching a rule, and
    // the audit trail keeps pointing at the same meaning either way.
    expect(stored.reasons.map((entry) => entry.reason.key).sort()).toEqual([
      'better-communication-style',
      'other',
      'stronger-contextual-experience',
    ]);
    expect(stored.reasons.map((entry) => entry.reason.name)).toContain(
      'Stronger contextual experience',
    );
  });

  it('persists no justification the vocabulary does not hold', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    await decide(
      before.matchId,
      { selectedMatchId: alternative.matchId, reasons: ['because-i-said-so'] },
      deps,
    );

    const stored = await prisma.matchingDecision.findUniqueOrThrow({
      where: { matchId: before.matchId },
      select: { reasons: true },
    });

    expect(stored.reasons).toHaveLength(0);
  });

  it('is idempotent per case, so a retry cannot rewrite the trail', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    await decide(
      before.matchId,
      { selectedMatchId: alternative.matchId, reasons: ['other'] },
      deps,
    );
    // A second call naming somebody else is a retry, not a revision.
    await decide(before.matchId, { selectedMatchId: before.matchId, reasons: [] }, deps);

    const rows = await prisma.matchingDecision.count({ where: { matchId: before.matchId } });
    expect(rows).toBe(1);
  });

  it('refuses a second decision on the same case at the database level too', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    await decide(
      before.matchId,
      { selectedMatchId: alternative.matchId, reasons: ['other'] },
      deps,
    );

    // The service is idempotent by reading first, so a direct write is the only way to
    // reach the constraint. A unique index is what holds when two decisions race, and a
    // race is exactly the case a read-then-write cannot cover.
    await expect(
      prisma.matchingDecision.create({
        data: {
          matchId: before.matchId,
          selectedMatchId: before.matchId,
          decisionType: 'SYSTEM_ACCEPTED',
        },
      }),
    ).rejects.toThrow();

    // And one candidate row cannot be the selection for two cases, which holds because a
    // candidate row belongs to exactly one pass.
    const other = await matchedIntake();
    await expect(
      prisma.matchingDecision.create({
        data: {
          matchId: other.matchId,
          selectedMatchId: alternative.matchId,
          decisionType: 'SYSTEM_ACCEPTED',
        },
      }),
    ).rejects.toThrow();
  });

  it('refuses a candidate from another pass, which is what the unique index also prevents', async () => {
    const first = await matchedIntake();
    const second = await matchedIntake();
    const stranger = firstEligible(second.alternatives);

    const outcome = await decide(
      first.matchId,
      { selectedMatchId: stranger.matchId, reasons: ['other'] },
      deps,
    );

    expect(outcome).toEqual({ kind: 'not-offered' });
    expect(await prisma.matchingDecision.count({ where: { matchId: first.matchId } })).toBe(0);
  });

  it('refuses a candidate the engine set aside, and does not write a decision', async () => {
    const before = await matchedIntake();
    const setAside = lastOf(before.alternatives);

    // The demo pool satisfies the demo scenario generously — every therapist is viable —
    // so the ineligible state is produced the same way this project's other store tests
    // produce it: by writing the row the engine would have written for a candidate that
    // missed a stated requirement. The rule being tested is about that state, not about
    // how the engine gets there.
    await prisma.match.update({
      where: { id: setAside.matchId },
      data: { status: 'INELIGIBLE', rejectionCode: 'REQUIREMENT_NOT_MET' },
    });

    const outcome = await decide(
      before.matchId,
      { selectedMatchId: setAside.matchId, reasons: ['other'] },
      deps,
    );

    // A distinct answer from "not offered", because this one is a rule and the other is
    // a mistake. And nothing was written.
    expect(outcome).toEqual({ kind: 'set-aside' });
    expect(await prisma.matchingDecision.count({ where: { matchId: before.matchId } })).toBe(0);
  });
});

describe('the queue', () => {
  it('lists a case while its recommendation stands, and drops it once decided', async () => {
    const before = await matchedIntake();
    const queue = await listCases(deps);

    expect(queue.map((entry) => entry.matchId)).toContain(before.matchId);

    const found = entryFor(queue, before.matchId);
    expect(found.status).toBe('NEEDS_REVIEW');
    expect(found.attempt).toBe(1);
    // Named terms, not keys, because a queue is scanned rather than queried.
    expect(found.primaryNeeds).toContain('Hindi');
    expect(found.primaryNeeds).toContain('Exploratory');
    expect(found.systemSuggestedName).toBeTruthy();

    await decide(before.matchId, { selectedMatchId: before.matchId, reasons: [] }, deps);

    const after = await listCases(deps);
    expect(after.map((entry) => entry.matchId)).not.toContain(before.matchId);
  });

  it('never lists an earlier pass, because a later pass means this one was declined', async () => {
    const { intakeId } = await matchedIntake();

    const first = await recommendedOf(intakeId, 1);

    await recordFeedback(first.id, { reasons: ['communication-mismatch'] }, { feedback });
    await requestRematch(first.id, { feedback, matches, therapists });

    const queue = await listCases(deps);
    const forThisIntake = queue.filter((entry) => entry.intakeId === intakeId);

    // Exactly one row, the second pass. Not zero, because the client is waiting; not two,
    // because the first pass was declined and its case is history.
    expect(forThisIntake).toHaveLength(1);
    expect(forThisIntake[0]?.attempt).toBe(2);
  });
});

describe('a case that has been through rematching', () => {
  it('shows the matcher the whole journey, with the client’s own words behind an opt-in', async () => {
    const { intakeId } = await matchedIntake();
    const first = await recommendedOf(intakeId, 1);

    await recordFeedback(
      first.id,
      {
        reasons: ['communication-mismatch', 'different-experience'],
        rawText: 'Too businesslike.',
      },
      { feedback },
    );
    await requestRematch(first.id, { feedback, matches, therapists });

    const second = await recommendedOf(intakeId, 2);

    const plain = await findCase(second.id, deps);

    if (plain === null) {
      throw new Error('the second pass produced no case to review');
    }

    expect(plain.journey).toHaveLength(2);
    expect(plain.journey[0]).toMatchObject({
      attempt: 1,
      status: 'DECLINED',
      clientFeedback: ['communication-mismatch', 'different-experience'],
      decision: null,
    });

    /*
     * The same reasons, in the client's own words.
     *
     * Read back from the database rather than asserted against a fixture, because the bug
     * this fixes was exactly a lookup that could silently find nothing: the interface built
     * an empty map and fell through to the key, and nothing failed. A test that supplied the
     * names itself would have passed with the lookup still broken.
     */
    expect(plain.journey[0]?.clientFeedbackNames).toEqual([
      'The communication style didn’t feel right.',
      'I wanted someone with different experience.',
    ]);
    expect(plain.summary.hasHistory).toBe(true);
    // Free text is not in the payload unless it was asked for, and "there is none" and
    // "withheld" are the same absence.
    expect(plain.clientsWords).toBeNull();

    const revealed = await findCase(second.id, deps, { revealWords: true });
    expect(revealed?.clientsWords?.intakeNote).toBe(SCENARIO.rawText);
    expect(revealed?.clientsWords?.feedbackNotes).toEqual([
      { attempt: 1, note: 'Too businesslike.' },
    ]);
  });

  it('resolves a declined case to whoever the client was shown, so the rematch excludes the right person', async () => {
    const { intakeId } = await matchedIntake();
    const first = await recommendedOf(intakeId, 1);

    // Decide pass one, choosing a different person than the engine did.
    const record = await workspace.findCase(first.id);

    if (record === null) {
      throw new Error('the first pass produced no case to review');
    }

    const alternative = firstEligible(
      record.candidates.filter((entry) => entry.eligible && entry.matchId !== first.id),
    );

    await decide(first.id, { selectedMatchId: alternative.matchId, reasons: ['other'] }, deps);

    // The client declines what they were shown.
    await recordFeedback(first.id, { reasons: ['communication-mismatch'] }, { feedback });

    const stored = await prisma.feedback.findUniqueOrThrow({
      where: { matchId: first.id },
      select: { therapistId: true },
    });

    // The complaint is filed against the person the client actually met, not the person the
    // engine happened to suggest. Filing it against the suggestion would exclude a
    // stranger from the next pass while leaving the rejected therapist eligible.
    expect(stored.therapistId).toBe(alternative.therapistId);
    expect(stored.therapistId).not.toBe(record.recommendedTherapistId);

    const context = await feedback.loadRematchContext(first.id);

    if (context === null) {
      throw new Error('the declined match produced no rematch context');
    }

    expect(context.declinedTherapistIds).toContain(alternative.therapistId);
    expect(context.declinedTherapistIds).not.toContain(record.recommendedTherapistId);

    // And the rematch genuinely does not return them.
    const rematched = await requestRematch(first.id, { feedback, matches, therapists });

    expect(rematched.kind).toBe('rematched');
    expect(rematched.kind === 'rematched' && rematched.therapist.id).not.toBe(
      alternative.therapistId,
    );
  });
});

describe('cascades', () => {
  it('removes the decision when the case’s pass is deleted, and never leaves it dangling', async () => {
    const before = await matchedIntake();
    await decide(before.matchId, { selectedMatchId: before.matchId, reasons: [] }, deps);

    expect(await prisma.matchingDecision.count({ where: { matchId: before.matchId } })).toBe(1);

    // Deleting the whole intake is the ordinary path a reseed takes.
    await prisma.intake.deleteMany({ where: { id: before.intakeId } });

    expect(await prisma.matchingDecision.count({ where: { matchId: before.matchId } })).toBe(0);
  });

  it('removes a decision’s reasons with it', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    await decide(
      before.matchId,
      { selectedMatchId: alternative.matchId, reasons: ['other', 'better-availability'] },
      deps,
    );

    const decisionId = (
      await prisma.matchingDecision.findUniqueOrThrow({ where: { matchId: before.matchId } })
    ).id;

    await prisma.matchingDecision.delete({ where: { id: decisionId } });

    // The vocabulary terms themselves are not deleted: a reason a matcher used is a fact
    // about a decision, and the terms outlive the decisions that cite them.
    expect(await prisma.matchingDecisionToReason.count({ where: { decisionId } })).toBe(0);
    expect(await prisma.matchingDecisionReason.count()).toBeGreaterThan(0);
  });
});

describe('the routes, against the real store', () => {
  it('creates, lists, decides and re-reads a case end to end', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    const app = buildApp({ workspace, matches, therapists, feedback });

    const queue = await app.inject({ method: 'GET', url: '/api/v1/matching-workspace/cases' });
    expect(queue.statusCode).toBe(200);
    expect(
      queue.json<{ cases: { matchId: string }[] }>().cases.map((entry) => entry.matchId),
    ).toContain(before.matchId);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${before.matchId}`,
    });
    expect(detail.statusCode).toBe(200);

    const body = detail.json<{ selectableMatchIds: string[]; alternatives: unknown[] }>();
    expect(body.selectableMatchIds).toContain(alternative.matchId);
    expect(body.alternatives.length).toBeGreaterThan(0);

    const decision = await app.inject({
      method: 'POST',
      url: `/api/v1/matching-workspace/cases/${before.matchId}/decision`,
      headers: { 'content-type': 'application/json' },
      payload: {
        selectedMatchId: alternative.matchId,
        reasons: ['better-communication-style'],
        note: 'Exploratory is what was asked for.',
      },
    });

    expect(decision.statusCode).toBe(200);
    expect(decision.json<{ differs: boolean }>().differs).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${before.matchId}`,
    });
    expect(after.json()).toMatchObject({
      summary: { status: 'DECIDED' },
      decision: { note: 'Exploratory is what was asked for.' },
    });

    await app.close();
  });

  it('answers a client-facing match request with the human’s choice, through the real store', async () => {
    const before = await matchedIntake();
    const alternative = firstEligible(before.alternatives);

    await decide(
      before.matchId,
      { selectedMatchId: alternative.matchId, reasons: ['other'] },
      deps,
    );

    const app = buildApp({ workspace, matches, therapists, feedback });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      headers: { 'content-type': 'application/json' },
      payload: { intakeId: before.intakeId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ matchId: string; therapist: { id: string } }>();

    expect(body.therapist.id).toBe(alternative.therapistId);
    expect(body.matchId).toBe(before.matchId);

    // The client learns that a person was chosen and nothing about how. No decision, no
    // note, no candidate list, no score — the response is the same shape it has always been.
    for (const forbidden of [
      'decision',
      'selectedMatchId',
      'note',
      'alternatives',
      'score',
      'rank',
      'reviewedBy',
    ]) {
      expect(response.body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    await app.close();
  });
});
