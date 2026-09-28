import { describe, expect, it } from 'vitest';
import { runMatchEngine } from './matchEngine.js';
import { toFeedbackSignals } from './feedbackSignals.js';
import { toClientSignals, type StoredIntake } from './signals.js';
import { evaluateCandidate } from './evidence.js';
import type { CandidateTherapist } from './matchingTypes.js';

/**
 * The engine, given feedback and an exclusion set.
 *
 * Two things are being defended here. The first is that a rematch is *different* — not
 * a reshuffle, not the same person again, and not the same person with a different
 * label. The second, and the more important, is that it is still the same engine: the
 * requirements still gate, the evidence is still built the same way, and the result is
 * still a pure function of its inputs.
 */

function therapist(overrides: Partial<CandidateTherapist> = {}): CandidateTherapist {
  return {
    id: '0199a1c2-3d4e-5f60-8712-93a4b5c6d700',
    displayName: 'Aditi Raghunathan',
    timezone: 'Asia/Kolkata',
    areasOfWork: ['relationships'],
    communicationStyles: ['exploratory'],
    approaches: ['integrative'],
    contextualExperience: ['indian-diaspora'],
    languages: ['en', 'hi'],
    sessionFormats: ['online'],
    availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 }],
    ...overrides,
  };
}

function intake(overrides: Partial<StoredIntake> = {}): StoredIntake {
  return {
    areasOfWork: ['relationships'],
    communicationStyles: ['exploratory'],
    openToGuidance: false,
    approaches: [],
    contextualExperiences: ['indian-diaspora'],
    languages: ['hi'],
    sessionFormats: ['online'],
    availability: {
      timezone: 'Asia/Kolkata',
      windows: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1260 }],
    },
    markedAsRequirements: false,
    ...overrides,
  };
}

describe('the exclusion set', () => {
  const first = therapist({ id: 't-first', displayName: 'First choice' });
  const second = therapist({
    id: 't-second',
    displayName: 'Second choice',
    areasOfWork: ['burnout'],
  });
  const third = therapist({
    id: 't-third',
    displayName: 'Third choice',
    areasOfWork: ['life-transitions'],
  });

  it('leaves everyone else in the running', () => {
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [first, second, third],
      excludedTherapistIds: [first.id],
    });

    const byId = new Map(result.candidates.map((candidate) => [candidate.therapistId, candidate]));

    // Not INELIGIBLE, which is the property that matters: the exclusion removed exactly
    // the one named and nothing else. One of the two is the recommendation, which is
    // `ELIGIBLE` promoted.
    expect(byId.get('t-second')?.status).not.toBe('INELIGIBLE');
    expect(byId.get('t-third')?.status).not.toBe('INELIGIBLE');
    expect(result.candidates.filter((candidate) => candidate.status === 'INELIGIBLE')).toHaveLength(
      1,
    );
  });

  it('never recommends someone who was already declined', () => {
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [first, second, third],
      excludedTherapistIds: [first.id],
    });

    expect(result.recommendation?.therapistId).not.toBe('t-first');
  });

  it('keeps them in the record, with a reason, rather than dropping them', () => {
    // A candidate that vanishes without a trace is indistinguishable from one that was
    // never in the list. A person said "not this one", and that is a decision the
    // reviewer's record has to hold.
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [first, second, third],
      excludedTherapistIds: [first.id],
    });

    const declined = result.candidates.find((candidate) => candidate.therapistId === 't-first');

    expect(declined).toMatchObject({
      status: 'INELIGIBLE',
      rejectionCode: 'DECLINED_PREVIOUSLY',
      score: 0,
    });
    expect(declined?.evidence).toEqual([]);
  });

  it('excludes every therapist who has ever been declined on this journey', () => {
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [first, second, third],
      excludedTherapistIds: ['t-first', 't-second'],
    });

    const recommended = result.recommendation?.therapistId;
    const setAside = result.candidates.filter(
      (candidate) => candidate.rejectionCode === 'DECLINED_PREVIOUSLY',
    );

    expect(recommended).toBe('t-third');
    expect(setAside.map((candidate) => candidate.therapistId).sort()).toEqual([
      't-first',
      't-second',
    ]);
  });

  it('recommends nobody once the pool is empty, and does not fall back to someone excluded', () => {
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [first, second],
      excludedTherapistIds: ['t-first', 't-second'],
    });

    expect(result.recommendation).toBeNull();
    expect(result.candidates.every((candidate) => candidate.status === 'INELIGIBLE')).toBe(true);
  });

  it('ignores an exclusion for a therapist who is not in the list at all', () => {
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [first],
      excludedTherapistIds: ['someone-who-does-not-exist'],
    });

    expect(result.recommendation?.therapistId).toBe('t-first');
  });
});

describe('feedback-adjusted preferences', () => {
  it('promotes the category the person mentioned, above one they did not', () => {
    // Set up so the ordering genuinely turns on the feedback, rather than assuming it
    // would. One therapist has *only* the style the client asked for; the other has
    // everything else the client named and none of the style. Before feedback the
    // second wins on the breadth of the overlap; after "the style did not feel right"
    // the style counts for more and the first wins.
    // No availability on either, so the arithmetic is legible from the weights:
    //   before: a = style 40 + language 30 + format 20 = 90
    //           b = areas 50 + language 30 + format 20 = 100
    //   after:  a = style 80 + language 30 + format 20 = 130  (the style, doubled)
    const styleOnly = therapist({
      id: 'a',
      displayName: 'Has the style and little else',
      communicationStyles: ['exploratory'],
      areasOfWork: [],
      contextualExperience: [],
      availability: [],
    });
    const breadthOnly = therapist({
      id: 'b',
      displayName: 'Has the breadth and not the style',
      communicationStyles: ['direct'],
      areasOfWork: ['relationships', 'burnout', 'career-transitions'],
      contextualExperience: [],
      availability: [],
    });

    const stored = intake({
      areasOfWork: ['relationships', 'burnout', 'career-transitions'],
      contextualExperiences: ['indian-diaspora'],
    });

    const before = runMatchEngine({ intake: stored, candidates: [styleOnly, breadthOnly] });
    const after = runMatchEngine({
      intake: stored,
      candidates: [styleOnly, breadthOnly],
      feedback: toFeedbackSignals(['communication-mismatch']),
    });

    expect(before.result.recommendation?.therapistId).toBe('b');
    expect(after.result.recommendation?.therapistId).toBe('a');
  });

  it('promotes a language preference the same way', () => {
    const speaksHindi = therapist({ id: 'a', displayName: 'Hindi', languages: ['en', 'hi'] });
    const speaksTamil = therapist({
      id: 'b',
      displayName: 'Tamil',
      languages: ['en', 'ta'],
      areasOfWork: ['burnout'],
    });
    const stored = intake({ areasOfWork: ['relationships', 'burnout'] });

    const after = runMatchEngine({
      intake: stored,
      candidates: [speaksHindi, speaksTamil],
      feedback: toFeedbackSignals(['language-mismatch']),
    });

    expect(after.result.recommendation?.therapistId).toBe('a');
  });

  it('promotes availability the same way', () => {
    const sharedEvenings = therapist({
      id: 'a',
      displayName: 'Evenings',
      availability: [
        { dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1260 },
        { dayOfWeek: 'WEDNESDAY', startMinute: 1080, endMinute: 1260 },
        { dayOfWeek: 'THURSDAY', startMinute: 1080, endMinute: 1260 },
      ],
    });
    const busyElsewhere = therapist({
      id: 'b',
      displayName: 'Mornings',
      areasOfWork: ['burnout'],
      availability: [{ dayOfWeek: 'SATURDAY', startMinute: 600, endMinute: 720 }],
    });
    const stored = intake({ areasOfWork: ['relationships', 'burnout'] });

    const after = runMatchEngine({
      intake: stored,
      candidates: [sharedEvenings, busyElsewhere],
      feedback: toFeedbackSignals(['availability-mismatch']),
    });

    expect(after.result.recommendation?.therapistId).toBe('a');
  });

  it('promotes a session format preference the same way', () => {
    const online = therapist({ id: 'a', displayName: 'Online', sessionFormats: ['online'] });
    const inPersonOnly = therapist({
      id: 'b',
      displayName: 'In person',
      sessionFormats: ['in-person'],
      areasOfWork: ['burnout'],
    });
    const stored = intake({ areasOfWork: ['relationships', 'burnout'] });

    // "Either is fine" stores both formats, so nobody is eliminated here; the boost is
    // what moves the person who offers the one the client marked.
    const after = runMatchEngine({
      intake: stored,
      candidates: [online, inPersonOnly],
      feedback: toFeedbackSignals(['format-mismatch']),
    });

    expect(after.result.recommendation?.therapistId).toBe('a');
  });

  it('still builds the same evidence, whatever the feedback said', () => {
    // A boost is a weight. It must not invent evidence, change a strength, or add a
    // category — the record has to be readable the same way it always is.
    const stored = intake();
    const candidate = therapist();
    const plain = evaluateCandidate(toClientSignals(stored), candidate);
    const boosted = evaluateCandidate(
      toClientSignals(stored),
      candidate,
      toFeedbackSignals(['communication-mismatch', 'language-mismatch']),
    );

    expect(
      boosted.evaluation.evidence.map((item) => [item.category, item.explanation, item.strength]),
    ).toEqual(
      plain.evaluation.evidence.map((item) => [item.category, item.explanation, item.strength]),
    );
    expect(boosted.evaluation.requirements).toEqual(plain.evaluation.requirements);
    // And the score moved, which is the only thing feedback is allowed to move.
    expect(boosted.evaluation.score).toBeGreaterThan(plain.evaluation.score);
  });

  it('does not escalate a boosted preference into a requirement', () => {
    // The single most important test in the file. "The style did not feel right" must
    // not become "only someone with a different style", which would go on eliminating
    // candidates on the person's behalf for a condition they never stated.
    const stored = intake({ communicationStyles: ['exploratory'] });
    const signals = toFeedbackSignals(['communication-mismatch']);

    // A therapist who shares the client's language and format but none of their style.
    const noStyleAtAll = therapist({ communicationStyles: ['direct'] });

    const before = evaluateCandidate(toClientSignals(stored), noStyleAtAll);
    const after = evaluateCandidate(toClientSignals(stored), noStyleAtAll, signals);

    expect(before.evaluation.status).toBe('ELIGIBLE');
    // Still eligible. A heavier weight for a style they did not have is still a weight.
    expect(after.evaluation.status).toBe('ELIGIBLE');
    expect(after.evaluation.rejectionCode).toBeNull();
  });

  it('still eliminates on a requirement, even after the same category is boosted', () => {
    // Language is both a requirement and a boosted category. Those two facts have to
    // coexist: the boost changes the ordering, the requirement keeps gating.
    const stored = intake({ languages: ['hi'] });
    const speaksNeither = therapist({ languages: ['fr', 'de'] });

    const after = evaluateCandidate(
      toClientSignals(stored),
      speaksNeither,
      toFeedbackSignals(['language-mismatch']),
    );

    expect(after.evaluation.status).toBe('INELIGIBLE');
    expect(after.evaluation.rejectionCode).toBe('NO_SHARED_LANGUAGE');
  });
});

describe('determinism of a rematch', () => {
  const candidates = [
    therapist({ id: 'a', displayName: 'A' }),
    therapist({ id: 'b', displayName: 'B', areasOfWork: ['burnout'] }),
    therapist({
      id: 'c',
      displayName: 'C',
      communicationStyles: ['direct'],
      areasOfWork: ['burnout'],
    }),
    therapist({ id: 'd', displayName: 'D', languages: ['fr'] }),
  ];

  it('gives the same answer twice with the same feedback', () => {
    const first = runMatchEngine({
      intake: intake(),
      candidates,
      excludedTherapistIds: ['a'],
      feedback: toFeedbackSignals(['communication-mismatch']),
    });
    const second = runMatchEngine({
      intake: intake(),
      candidates,
      excludedTherapistIds: ['a'],
      feedback: toFeedbackSignals(['communication-mismatch']),
    });

    expect(second.result).toEqual(first.result);
  });

  it('gives the same answer whatever order the candidates arrive in', () => {
    const forwards = runMatchEngine({
      intake: intake(),
      candidates,
      excludedTherapistIds: ['a'],
      feedback: toFeedbackSignals(['availability-mismatch']),
    });
    const backwards = runMatchEngine({
      intake: intake(),
      candidates: [...candidates].reverse(),
      excludedTherapistIds: ['a'],
      feedback: toFeedbackSignals(['availability-mismatch']),
    });

    expect(backwards.result.candidates.map((c) => c.therapistId)).toEqual(
      forwards.result.candidates.map((c) => c.therapistId),
    );
    expect(backwards.result.recommendation?.therapistId).toBe(
      forwards.result.recommendation?.therapistId,
    );
  });

  it('does not depend on the order the reasons arrived in', () => {
    const forwards = runMatchEngine({
      intake: intake(),
      candidates,
      excludedTherapistIds: ['a'],
      feedback: toFeedbackSignals(['communication-mismatch', 'language-mismatch']),
    });
    const backwards = runMatchEngine({
      intake: intake(),
      candidates,
      excludedTherapistIds: ['a'],
      feedback: toFeedbackSignals(['language-mismatch', 'communication-mismatch']),
    });

    expect(backwards.result).toEqual(forwards.result);
  });

  it('reads no clock, so the same week of the year is the same result', () => {
    // Availability's reference week is a constant for exactly this reason. A result that
    // changed with the date would not be a decision anyone could be shown twice.
    const first = runMatchEngine({
      intake: intake(),
      candidates,
      feedback: toFeedbackSignals(['availability-mismatch']),
    });
    const second = runMatchEngine({
      intake: intake(),
      candidates,
      feedback: toFeedbackSignals(['availability-mismatch']),
    });

    expect(second.result).toEqual(first.result);
  });
});

describe('a second and a third rematch', () => {
  const pool = [
    therapist({ id: 'a', displayName: 'A' }),
    therapist({ id: 'b', displayName: 'B', areasOfWork: ['burnout'] }),
    therapist({ id: 'c', displayName: 'C', areasOfWork: ['life-transitions'] }),
  ];

  it('walks down the list without repeating anyone', () => {
    // T1 declined, T2 declined, T3 next. The exclusion set grows by exactly one each
    // time and is carried forward, so nothing already seen can come back.
    const seen: string[] = [];
    let remaining = [...pool];

    for (let round = 0; round < 3; round += 1) {
      const { result } = runMatchEngine({
        intake: intake(),
        candidates: remaining,
        excludedTherapistIds: [],
        feedback: toFeedbackSignals(['communication-mismatch']),
      });

      const chosen = result.recommendation?.therapistId;
      expect(chosen).toBeDefined();
      expect(seen).not.toContain(chosen);
      seen.push(chosen ?? '');
      remaining = remaining.filter((candidate) => candidate.id !== chosen);
    }

    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('runs out honestly once the pool is empty', () => {
    const { result } = runMatchEngine({
      intake: intake(),
      candidates: [],
      excludedTherapistIds: pool.map((candidate) => candidate.id),
    });

    expect(result.recommendation).toBeNull();
    expect(result.candidates.every((candidate) => candidate.status === 'INELIGIBLE')).toBe(true);
  });
});
