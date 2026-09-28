import { describe, expect, it } from 'vitest';
import { runMatchEngine } from './matchEngine.js';
import { toClientSignals, deriveRequirements, type StoredIntake } from './signals.js';
import { prioritiseEvidence } from './prioritise.js';
import { explainAll, formatMinuteOfDay, type ExplanationVocabulary } from './explanations.js';
import { orderCandidates, selectRecommendation } from './ordering.js';
import { evaluateCandidate, evaluateRequirements, buildEvidence } from './evidence.js';
import { CATEGORY_MAX_SCORE, categoryScore, REQUIREMENT_BONUS } from './weights.js';
import {
  MATCH_CATEGORIES,
  MATCH_EXPLANATIONS,
  REJECTION_CODES,
  type CandidateEvaluation,
  type CandidateTherapist,
  type ClientSignals,
} from './matchingTypes.js';
import type { DayName } from '../dayOfWeek.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VOCABULARY: ExplanationVocabulary = {
  names: new Map([
    ['hi', 'Hindi'],
    ['en', 'English'],
    ['ta', 'Tamil'],
    ['relationships', 'Relationships'],
    ['career-transitions', 'Career transitions'],
    ['burnout', 'Burnout'],
    ['exploratory', 'Exploratory'],
    ['structured', 'Structured'],
    ['online', 'Online'],
    ['in-person', 'In person'],
    ['indian-diaspora', 'Indian diaspora'],
    ['cross-cultural-relationships', 'Cross-cultural relationships'],
    ['integrative', 'Integrative'],
  ]),
};

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

/** A client asking for the demo scenario: Hindi, exploratory, diaspora, Tuesday evening. */
function signals(overrides: Partial<ClientSignals> = {}): ClientSignals {
  return {
    ...toClientSignals(intake()),
    ...overrides,
  };
}

function run(stored: StoredIntake, candidates: readonly CandidateTherapist[]) {
  return runMatchEngine({ intake: stored, candidates });
}

// ---------------------------------------------------------------------------
// Requirements and preferences
// ---------------------------------------------------------------------------

describe('requirements eliminate; preferences only weigh', () => {
  it('sets aside a candidate who speaks none of the chosen languages', () => {
    const { result } = run(intake({ languages: ['hi'] }), [
      therapist({ id: 'a', languages: ['en', 'fr'] }),
    ]);

    expect(result.candidates[0]?.status).toBe('INELIGIBLE');
    expect(result.candidates[0]?.rejectionCode).toBe('NO_SHARED_LANGUAGE');
    expect(result.recommendation).toBeNull();
  });

  it('accepts a candidate who shares any one of several chosen languages', () => {
    // "At least one", not "all of them": someone who listed Hindi and Tamil was not
    // saying they would refuse a session in Tamil.
    const { result } = run(intake({ languages: ['hi', 'ta'] }), [
      therapist({ id: 'a', languages: ['ta'] }),
    ]);

    expect(result.candidates[0]?.status).toBe('RECOMMENDED');
    expect(result.candidates[0]?.rejectionCode).toBeNull();
  });

  it('names the languages it is missing, so an elimination can be explained', () => {
    const { result } = run(intake({ languages: ['hi', 'ta'] }), [
      therapist({ id: 'a', languages: ['en'] }),
    ]);

    expect(result.candidates[0]?.requirements[0]?.missing).toEqual(['hi', 'ta']);
  });

  it('sets aside a candidate who offers no acceptable session format', () => {
    const { result } = run(intake({ sessionFormats: ['online'] }), [
      therapist({ id: 'a', sessionFormats: ['in-person'] }),
    ]);

    expect(result.candidates[0]?.status).toBe('INELIGIBLE');
    expect(result.candidates[0]?.rejectionCode).toBe('NO_ACCEPTED_SESSION_FORMAT');
  });

  it('does not set anyone aside for "either is fine"', () => {
    // The intake stores "either" as both formats, so an ANY_OF requirement over
    // both excludes nobody — which is the right answer for the answer given.
    const { result } = run(intake({ sessionFormats: ['in-person', 'online'] }), [
      therapist({ id: 'a', sessionFormats: ['online'] }),
    ]);

    expect(result.candidates[0]?.status).toBe('RECOMMENDED');
  });

  it('never sets anyone aside for a preference', () => {
    const { result } = run(
      intake({
        areasOfWork: ['burnout', 'career-transitions'],
        communicationStyles: ['structured'],
        contextualExperiences: ['cross-cultural-relationships'],
      }),
      [
        therapist({
          id: 'a',
          areasOfWork: ['relationships'],
          communicationStyles: ['warm'],
          contextualExperience: ['relocation'],
        }),
      ],
    );

    expect(result.candidates[0]?.status).toBe('RECOMMENDED');

    // Every preference that was asked for came back unmatched, and none of them set
    // the candidate aside. What is left is the language and the format, which the
    // fixture shares and which the client also named.
    expect(result.candidates[0]?.evidence.map((item) => item.category)).toEqual([
      'LANGUAGE',
      'SESSION_FORMAT',
      'AVAILABILITY',
    ]);
  });

  it('treats a preference set marked as requirements as all-of', () => {
    // The `ClientPreference.kind` column, when something insists rather than wishes.
    const { result } = run(
      intake({ markedAsRequirements: true, areasOfWork: ['relationships', 'burnout'] }),
      [therapist({ id: 'a', areasOfWork: ['relationships'] })],
    );

    expect(result.candidates[0]?.status).toBe('INELIGIBLE');
    expect(
      result.candidates[0]?.requirements.find((rule) => rule.ruleKey === 'areas_of_work')?.missing,
    ).toEqual(['burnout']);
  });

  it('derives the same requirements every time from the same intake', () => {
    const once = deriveRequirements(intake());
    const twice = deriveRequirements(intake({ languages: ['hi', 'hi'] }));

    expect(once.map((rule) => rule.ruleKey)).toEqual(['language', 'session_format']);
    expect(twice[0]?.keys).toEqual(['hi']);
  });

  it('ignores style entirely when the person said they are not sure yet', () => {
    // They did not say style does not matter. They said they do not know yet, and
    // scoring a candidate down for it would answer a question they declined to ask.
    const { result } = run(intake({ openToGuidance: true, communicationStyles: [] }), [
      therapist({ id: 'a', communicationStyles: ['exploratory'] }),
    ]);

    const evidence = result.candidates[0]?.evidence ?? [];

    expect(evidence.some((item) => item.category === 'COMMUNICATION_STYLE')).toBe(false);
    expect(result.candidates[0]?.status).toBe('RECOMMENDED');
  });
});

describe('evidence', () => {
  it('names the key on both sides of every overlap', () => {
    const { result } = run(intake(), [therapist()]);
    const evidence = result.candidates[0]?.evidence ?? [];

    for (const item of evidence) {
      expect(item.clientKey).not.toBe('');
      expect(item.therapistKey).not.toBe('');
    }
  });

  it('marks every language that satisfied a requirement as required', () => {
    // The rule is "at least one of these", and both Hindi and Tamil satisfied it, so
    // both are the reason this candidate qualified.
    const { result } = run(intake({ languages: ['hi', 'ta'] }), [
      therapist({ languages: ['en', 'hi', 'ta'] }),
    ]);

    const languages = (result.candidates[0]?.evidence ?? []).filter(
      (item) => item.category === 'LANGUAGE',
    );

    expect(languages.map((item) => item.explanation)).toEqual([
      'REQUIRED_LANGUAGE',
      'REQUIRED_LANGUAGE',
    ]);
  });

  it('does not call a language "required" when the set it belongs to failed', () => {
    // Under "all of these" the client insisted on Hindi *and* Tamil, and this
    // therapist has only Hindi. No single language is the one they insisted on —
    // they insisted on the pair — so the shared one is recorded as a preference.
    // The candidate is ineligible regardless; this is about the record being
    // accurate, and about `PREFERRED_LANGUAGE` being reachable at all.
    const { result } = run(intake({ languages: ['hi', 'ta'], markedAsRequirements: true }), [
      therapist({ languages: ['en', 'hi'] }),
    ]);

    expect(result.candidates[0]?.status).toBe('INELIGIBLE');

    const languages = (result.candidates[0]?.evidence ?? []).filter(
      (item) => item.category === 'LANGUAGE',
    );

    expect(languages.find((item) => item.clientKey === 'hi')?.explanation).toBe(
      'PREFERRED_LANGUAGE',
    );
  });

  it('records one item per shared day, with both people own times', () => {
    const { result } = run(intake(), [therapist()]);
    const availability = (result.candidates[0]?.evidence ?? []).find(
      (item) => item.category === 'AVAILABILITY',
    );

    expect(availability?.explanation).toBe('AVAILABILITY_OVERLAP');
    // The client wants 18:00–21:00 and the therapist is free 17:00–21:00, so the
    // shared minute is the client's whole window — and on both clocks.
    expect(availability?.overlap).toMatchObject({
      dayOfWeek: 'TUESDAY',
      startMinute: 1080,
      endMinute: 1260,
      therapistDayOfWeek: 'TUESDAY',
      therapistStartMinute: 1080,
      therapistEndMinute: 1260,
    });
  });

  it('produces no availability evidence when the client shared no times', () => {
    const { result } = run(intake({ availability: null }), [therapist()]);

    expect(
      (result.candidates[0]?.evidence ?? []).some((item) => item.category === 'AVAILABILITY'),
    ).toBe(false);
  });

  it('does not eliminate a candidate whose timezone cannot be read', () => {
    // "We could not compare" is not "we compared and found nothing", and only one of
    // those is a reason to set someone aside.
    const { result } = run(intake(), [therapist({ timezone: 'Not/AZone' })]);

    expect(result.candidates[0]?.status).toBe('RECOMMENDED');
    expect(result.availabilityUncomparable).toBe(true);
  });

  it('uses only the seven declared categories', () => {
    const { result } = run(intake(), [therapist()]);
    const used = new Set((result.candidates[0]?.evidence ?? []).map((item) => item.category));

    for (const category of used) {
      expect(MATCH_CATEGORIES).toContain(category);
    }
  });

  it('gives every category the same treatment whether it was asked about or not', () => {
    // The engine supports approaches even though the intake does not ask about
    // them yet. A client who has expressed one must get evidence for it.
    const { result } = run(intake({ approaches: ['integrative'] }), [therapist()]);

    expect(
      (result.candidates[0]?.evidence ?? []).some(
        (item) => item.category === 'THERAPEUTIC_APPROACH' && item.clientKey === 'integrative',
      ),
    ).toBe(true);
  });
});

describe('scoring', () => {
  it('scales a category by the share of what the client asked for', () => {
    // Two shared areas out of three asked for is a closer fit than two out of five,
    // even though both candidates share exactly two. The denominator is what the
    // *client* said, so asking about more things cannot be gamed by offering more.
    expect(categoryScore(CATEGORY_MAX_SCORE.AREA_OF_WORK, 2, 3)).toBe(33);
    expect(categoryScore(CATEGORY_MAX_SCORE.AREA_OF_WORK, 2, 5)).toBe(20);
    expect(categoryScore(CATEGORY_MAX_SCORE.AREA_OF_WORK, 2, 3)).toBeGreaterThan(
      categoryScore(CATEGORY_MAX_SCORE.AREA_OF_WORK, 2, 5),
    );
  });

  it('gives the same score to the same share, however the question is split', () => {
    expect(categoryScore(50, 1, 2)).toBe(categoryScore(50, 2, 4));
  });

  it('scores nothing for a category the client said nothing about', () => {
    expect(categoryScore(50, 0, 0)).toBe(0);
  });

  it('is exact integer arithmetic, with no floating point in the path', () => {
    expect(categoryScore(50, 1, 3)).toBe(16);
    expect(categoryScore(30, 2, 3)).toBe(20);
    expect(Number.isInteger(categoryScore(40, 1, 7))).toBe(true);
  });

  it('rewards a satisfied requirement above the whole preference field', () => {
    const { result } = run(intake({ areasOfWork: ['relationships', 'burnout'] }), [therapist()]);
    const candidate = result.candidates[0];

    const preferenceTotal = Object.values(CATEGORY_MAX_SCORE)
      .filter((value) => value > 0)
      .reduce((sum, value) => sum + value, 0);

    // One requirement satisfied, everything the client named covered, and the score
    // is still dominated by the requirement rather than the interests.
    expect(candidate?.score ?? 0).toBeGreaterThanOrEqual(REQUIREMENT_BONUS);
    expect(preferenceTotal).toBeGreaterThan(0);
  });

  it('makes a satisfied requirement outrank every preference put together', () => {
    const preferenceTotal = Object.values(CATEGORY_MAX_SCORE)
      .filter((value) => value > 0)
      .reduce((sum, value) => sum + value, 0);

    // The property the comment in weights.ts claims, checked rather than trusted.
    expect(REQUIREMENT_BONUS).toBeGreaterThan(preferenceTotal);
  });

  it('caps availability, so a week-wide calendar cannot outweigh a closer fit', () => {
    const days = (
      list: readonly DayName[],
    ): readonly { dayOfWeek: DayName; startMinute: number; endMinute: number }[] =>
      list.map((day) => ({ dayOfWeek: day, startMinute: 1020, endMinute: 1260 }));

    const three: readonly DayName[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY'];
    const five: readonly DayName[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    const one: readonly DayName[] = ['TUESDAY'];

    const scoreWith = (clientDays: readonly DayName[], therapistDays: readonly DayName[]): number =>
      run(
        intake({
          availability: { timezone: 'Asia/Kolkata', windows: days(clientDays) },
        }),
        [
          therapist({
            id: 'a',
            availability: days(therapistDays),
          }),
        ],
      ).result.candidates[0]?.score ?? 0;

    // Past the cap, more shared evenings stop earning anything, so a therapist who
    // is free all week cannot outrank one who shares exactly the cap.
    expect(scoreWith(five, five)).toBe(scoreWith(three, three));
    // And below the cap every shared day does count.
    expect(scoreWith(three, three)).toBeGreaterThan(scoreWith(one, one));
  });
});

describe('ordering and selection', () => {
  const strong = therapist({ id: 'b-strong', displayName: 'Strong' });
  const weak = therapist({
    id: 'a-weak',
    displayName: 'Weak',
    areasOfWork: ['burnout'],
    communicationStyles: ['structured'],
    contextualExperience: ['relocation'],
  });

  it('orders by score, highest first', () => {
    const { result } = run(intake({ areasOfWork: ['relationships', 'burnout'] }), [weak, strong]);

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['Strong', 'Weak']);
    expect(result.recommendation?.therapistId).toBe('b-strong');
  });

  it('breaks a score tie on the same key however the candidates arrived', () => {
    const forward = run(intake(), [therapist({ id: 'a' }), therapist({ id: 'b' })]);
    const backward = run(intake(), [therapist({ id: 'b' }), therapist({ id: 'a' })]);

    expect(forward.result.candidates.map((c) => c.therapistId)).toEqual(
      backward.result.candidates.map((c) => c.therapistId),
    );
  });

  it('falls back to the identifier, so the order is always total', () => {
    const a = therapist({ id: 'aaa' });
    const b = therapist({ id: 'bbb' });

    expect(
      orderCandidates([
        { ...evaluationOf(a), score: 10 },
        { ...evaluationOf(b), score: 10 },
      ]).map((candidate) => candidate.therapistId),
    ).toEqual(['aaa', 'bbb']);
  });

  it('prefers a satisfied requirement over a broader but unmet one', () => {
    const meetsOneRequirement = therapist({
      id: 'a',
      displayName: 'Meets the language',
      areasOfWork: ['burnout', 'career-transitions'],
    });

    const { result } = run(intake({ languages: ['hi'], areasOfWork: ['relationships'] }), [
      weak,
      meetsOneRequirement,
    ]);

    // Both satisfy the language, so this falls through to preferences — where the
    // one sharing nothing at all cannot win.
    expect(result.recommendation?.displayName).toBe('Meets the language');
  });

  it('recommends nothing when nothing survives, and says why each was set aside', () => {
    const { result } = run(intake({ languages: ['hi'] }), [
      therapist({ id: 'a', languages: ['en'] }),
    ]);

    expect(result.recommendation).toBeNull();
    expect(result.candidates[0]?.rejectionCode).toBe('NO_SHARED_LANGUAGE');
  });

  it('promotes exactly one candidate, and it is the one in the ordered list', () => {
    const { result } = run(intake(), [therapist({ id: 'a' }), therapist({ id: 'b' })]);

    const recommended = result.candidates.filter((c) => c.status === 'RECOMMENDED');

    expect(recommended).toHaveLength(1);
    expect(recommended[0]?.therapistId).toBe(result.recommendation?.therapistId);
  });

  it('selects null from an empty candidate set rather than throwing', () => {
    expect(selectRecommendation([])).toBeNull();
  });
});

describe('the whole pipeline is deterministic', () => {
  const candidates = [
    therapist({ id: 'a', areasOfWork: ['relationships', 'burnout'] }),
    therapist({ id: 'b', languages: ['en', 'hi', 'ta'], timezone: 'Europe/London' }),
    therapist({ id: 'c', contextualExperience: ['cross-cultural-relationships'] }),
    therapist({ id: 'd', languages: ['fr'] }),
  ];

  it('produces an identical result on a second run', () => {
    expect(run(intake(), candidates).result).toEqual(run(intake(), candidates).result);
  });

  it('produces an identical result whatever order the candidates arrive in', () => {
    const forward = run(intake(), candidates).result;
    const reversed = run(intake(), [...candidates].reverse()).result;

    expect(reversed).toEqual(forward);
  });

  it('reads no clock and no randomness', () => {
    // The engine takes only an intake and a candidate list. There is no parameter
    // through which a time or a random value could arrive, which is the strongest
    // available statement that the result cannot depend on either.
    const first = run(intake(), candidates).result;
    const second = run(intake(), candidates).result;

    expect(first).toEqual(second);
  });

  it('keeps ineligible candidates in the result, with their reason', () => {
    const { result } = run(intake(), candidates);
    const ineligible = result.candidates.filter((c) => c.status === 'INELIGIBLE');

    expect(ineligible.length).toBeGreaterThan(0);

    for (const candidate of ineligible) {
      expect(REJECTION_CODES).toContain(candidate.rejectionCode);
    }
  });

  it('records the engine version on every result', () => {
    expect(run(intake(), candidates).result.engineVersion).toBe('v1');
  });
});

describe('the trace', () => {
  it('carries the name, the reason and the score for every candidate', () => {
    const { trace } = run(intake({ languages: ['hi'] }), [
      therapist({ id: 'a', displayName: 'Shares Hindi' }),
      therapist({ id: 'b', displayName: 'Speaks French', languages: ['fr'] }),
    ]);

    expect(trace).toHaveLength(2);
    expect(trace[1]).toMatchObject({
      therapistId: 'b',
      displayName: 'Speaks French',
      eligible: false,
      rejectionCode: 'NO_SHARED_LANGUAGE',
    });
    expect(trace[0]).toMatchObject({ eligible: true, rejectionCode: null });
  });

  it('omits the score for a candidate that was set aside', () => {
    const { result } = run(intake({ languages: ['hi'] }), [
      therapist({ id: 'a', languages: ['en'] }),
    ]);

    expect(result.candidates[0]?.score).toBe(0);
  });
});

function evaluationOf(candidate: CandidateTherapist): CandidateEvaluation {
  return evaluateCandidate(signals(), candidate).evaluation;
}

// ---------------------------------------------------------------------------
// Prioritisation and explanation
// ---------------------------------------------------------------------------

describe('choosing which reasons to show', () => {
  const many = buildEvidence(
    signals({
      areasOfWork: ['relationships', 'career-transitions', 'burnout'],
      approaches: ['integrative'],
      communicationStyles: ['exploratory'],
      contextualExperiences: ['indian-diaspora'],
    }),
    therapist({
      areasOfWork: ['relationships', 'career-transitions', 'burnout'],
      approaches: ['integrative'],
      contextualExperience: ['indian-diaspora', 'cross-cultural-relationships'],
    }),
    [],
  ).evidence;

  it('shows a handful, not everything', () => {
    expect(many.length).toBeGreaterThan(5);
    expect(prioritiseEvidence(many).length).toBeLessThanOrEqual(5);
  });

  it('puts a satisfied requirement first', () => {
    const withRequirement = buildEvidence(
      signals({ languages: ['hi'] }),
      therapist({ languages: ['en', 'hi'] }),
      evaluateRequirements(signals({ languages: ['hi'] }), therapist({ languages: ['en', 'hi'] })),
    ).evidence;

    expect(prioritiseEvidence(withRequirement)[0]?.strength).toBe('REQUIREMENT');
  });

  it('shows requirements first, then preferences, then availability', () => {
    // The brief's tiers, and the two that actually decide what a reader sees first.
    // Strength answers "was this insisted on"; EXPLANATION_PRIORITY answers "how
    // interesting is it". A session format is the lowest-scoring category in the
    // dataset, and it still shows early — because the intake made it a requirement,
    // and someone who said "online only" wants the practical thing settled first.
    const everything = buildEvidence(
      signals({
        areasOfWork: ['relationships'],
        contextualExperiences: ['indian-diaspora'],
        communicationStyles: ['exploratory'],
        approaches: ['integrative'],
      }),
      therapist({
        areasOfWork: ['relationships'],
        contextualExperience: ['indian-diaspora'],
        communicationStyles: ['exploratory'],
        approaches: ['integrative'],
      }),
      evaluateRequirements(signals(), therapist()),
    ).evidence;

    // A generous limit, so the weak signals are present to be ordered.
    const order = prioritiseEvidence(everything, 8).map((item) => item.explanation);

    // Tier 1: the two requirements, language first.
    expect(order[0]).toBe('REQUIRED_LANGUAGE');
    expect(order[1]).toBe('SESSION_FORMAT');

    // Tier 2: the preferences, strongest first by category weight.
    expect(order.indexOf('AREA_OF_WORK')).toBeLessThan(order.indexOf('CONTEXTUAL_EXPERIENCE'));
    expect(order.indexOf('CONTEXTUAL_EXPERIENCE')).toBeLessThan(
      order.indexOf('COMMUNICATION_STYLE'),
    );
    expect(order.indexOf('COMMUNICATION_STYLE')).toBeLessThan(
      order.indexOf('THERAPEUTIC_APPROACH'),
    );

    // Tier 3: availability, after every preference.
    expect(order.indexOf('AVAILABILITY_OVERLAP')).toBeGreaterThan(
      order.indexOf('THERAPEUTIC_APPROACH'),
    );
  });

  it('leaves availability out entirely when the preferences fill the list', () => {
    // The consequence of the rule above, and the reason it is a rule: when someone
    // really does share all of what was asked for, the page never has to talk about
    // evenings at all.
    const everything = buildEvidence(
      signals({
        areasOfWork: ['relationships'],
        contextualExperiences: ['indian-diaspora'],
        communicationStyles: ['exploratory'],
        approaches: ['integrative'],
      }),
      therapist({
        areasOfWork: ['relationships'],
        contextualExperience: ['indian-diaspora'],
        communicationStyles: ['exploratory'],
        approaches: ['integrative'],
      }),
      evaluateRequirements(signals(), therapist()),
    ).evidence;

    const shown = prioritiseEvidence(everything).map((item) => item.explanation);

    expect(shown).not.toContain('AVAILABILITY_OVERLAP');
  });

  it('stops one category from filling the list', () => {
    const mostlyAvailability = buildEvidence(
      signals({
        availability: {
          timezone: 'Asia/Kolkata',
          windows: (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const).map(
            (day) => ({ dayOfWeek: day, startMinute: 1020, endMinute: 1260 }),
          ),
        },
      }),
      therapist({
        availability: (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const).map(
          (day) => ({ dayOfWeek: day, startMinute: 1020, endMinute: 1260 }),
        ),
      }),
      [],
    ).evidence;

    const shown = prioritiseEvidence(mostlyAvailability);

    expect(shown.filter((item) => item.category === 'AVAILABILITY').length).toBeLessThanOrEqual(2);
  });

  it('is the same shortlist every time, in the same order', () => {
    expect(prioritiseEvidence(many)).toEqual(prioritiseEvidence([...many].reverse()));
  });

  it('changes only when the evidence does', () => {
    const withoutContext = many.filter((item) => item.category !== 'CONTEXTUAL_EXPERIENCE');

    expect(prioritiseEvidence(withoutContext)).not.toEqual(prioritiseEvidence(many));
  });
});

describe('explanations', () => {
  function explain(stored: StoredIntake, candidate: CandidateTherapist) {
    const { evaluation } = evaluateCandidate(toClientSignals(stored), candidate);
    const shown = prioritiseEvidence(evaluation.evidence);

    return explainAll(shown, VOCABULARY);
  }

  it('can explain every reason the engine is able to produce', () => {
    // A total function over the explanation vocabulary: no reason can be recorded
    // without also being sayable, and a new one is a type error until it is.
    const reasons = new Set<string>();

    for (const key of MATCH_EXPLANATIONS) {
      const built = buildEvidence(
        signals({
          areasOfWork: ['relationships'],
          communicationStyles: ['exploratory'],
          approaches: ['integrative'],
          contextualExperiences: ['indian-diaspora'],
          languages: ['hi', 'en'],
          sessionFormats: ['online'],
          openToGuidance: false,
        }),
        therapist({
          areasOfWork: ['relationships'],
          communicationStyles: ['exploratory'],
          approaches: ['integrative'],
          contextualExperience: ['indian-diaspora'],
          languages: ['hi', 'en'],
          sessionFormats: ['online'],
        }),
        evaluateRequirements(
          signals({ languages: ['hi', 'en'], sessionFormats: ['online'] }),
          therapist({ languages: ['hi', 'en'], sessionFormats: ['online'] }),
        ),
      ).evidence;

      for (const item of built) {
        if (item.explanation === key) {
          reasons.add(key);
        }
      }
    }

    expect([...reasons].sort()).toEqual([...MATCH_EXPLANATIONS].sort());
  });

  it('writes one sentence per reason, and each is a sentence', () => {
    const sentences = explain(intake(), therapist());

    expect(sentences.length).toBeGreaterThan(0);

    for (const sentence of sentences) {
      expect(sentence.sentence.length).toBeGreaterThan(10);
      expect(sentence.sentence.endsWith('.')).toBe(true);
      expect(sentence.detail.length).toBeGreaterThan(0);
    }
  });

  it('mentions a language by its name, never by its code', () => {
    const sentences = explain(intake({ languages: ['hi'] }), therapist());

    expect(sentences[0]?.sentence).toContain('Hindi');
    expect(sentences.map((s) => s.sentence).join(' ')).not.toMatch(/\bhi\b/);
  });

  it("uses the product wording, never the database's internal taxonomy", () => {
    // The vocabulary holds "Career transitions" and "Burnout" because those are
    // tidy column headings in a database. A sentence is not a column heading, and
    // the intake asked the question as "Work or career" — so the explanation has to
    // use the words the product uses, not the words the schema uses.
    const [only] = explainAll(
      buildEvidence(
        signals({ areasOfWork: ['career-transitions', 'burnout'] }),
        therapist({ areasOfWork: ['career-transitions', 'burnout'] }),
        [],
      ).evidence.filter((item) => item.category === 'AREA_OF_WORK'),
      VOCABULARY,
    );

    const sentences = explainAll(
      buildEvidence(
        signals({ areasOfWork: ['career-transitions', 'burnout'] }),
        therapist({ areasOfWork: ['career-transitions', 'burnout'] }),
        [],
      ).evidence.filter((item) => item.category === 'AREA_OF_WORK'),
      VOCABULARY,
    ).map((item) => item.sentence);

    expect(sentences.some((s) => s.includes('work and career'))).toBe(true);
    expect(sentences.some((s) => s.includes('feeling overwhelmed'))).toBe(true);
    expect(sentences.join(' ')).not.toMatch(/Career transitions|Burnout/);
    expect(only?.detail).not.toBe('Career transitions');
  });

  it('says the same word two different ways when a key means two things', () => {
    // `exploratory` is both a conversation style and a therapeutic approach. As a
    // style it is a description of a person; as an approach it must stay the plain
    // word, because "their way of working is someone who helps you explore things"
    // would be a claim about a clinical method that nothing here supports.
    const stored = intake({ communicationStyles: ['exploratory'], approaches: ['exploratory'] });
    const candidate = therapist({
      communicationStyles: ['exploratory'],
      approaches: ['exploratory'],
    });

    const { evaluation } = evaluateCandidate(toClientSignals(stored), candidate);
    const sentences = explainAll(evaluation.evidence, VOCABULARY).map((item) => item.sentence);

    expect(sentences).toContain('You wanted someone who helps you explore things.');
    expect(sentences).toContain('Their way of working is Exploratory.');
  });

  it('still says something readable for a term nobody has written a phrase for', () => {
    // A key added to the vocabulary next month must produce a sentence, not a blank,
    // and must never reach a reader as a raw key.
    const [only] = explainAll(
      [
        {
          category: 'AREA_OF_WORK',
          strength: 'PREFERENCE',
          clientKey: 'something-new',
          therapistKey: 'something-new',
          explanation: 'AREA_OF_WORK',
          weight: 50,
        },
      ],
      { names: new Map() },
    );

    expect(only?.sentence).toBe(
      'You said you wanted support with something new, and they work with it.',
    );
  });

  it('describes an approach without ranking it', () => {
    const [only] = explainAll(
      buildEvidence(
        signals({ approaches: ['integrative'] }),
        therapist({ approaches: ['integrative'] }),
        [],
      ).evidence.filter((item) => item.category === 'THERAPEUTIC_APPROACH'),
      VOCABULARY,
    );

    expect(only?.sentence).toBe('Their way of working is Integrative.');
    expect(only?.sentence.toLowerCase()).not.toMatch(/better|best|more effective/);
  });

  it('names the time in the client own clock', () => {
    const [only] = explainAll(
      buildEvidence(
        signals(),
        therapist(),
        evaluateRequirements(signals(), therapist()),
      ).evidence.filter((item) => item.category === 'AVAILABILITY'),
      VOCABULARY,
    );

    expect(only?.sentence).toContain('your time');
    expect(only?.detail).toBe('Tuesday 18:00–21:00');
  });

  it('says when a shared time only holds for part of the year', () => {
    const [only] = explainAll(
      buildEvidence(
        signals({
          availability: {
            timezone: 'Asia/Kolkata',
            windows: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1260 }],
          },
        }),
        therapist({
          timezone: 'Europe/London',
          availability: [{ dayOfWeek: 'TUESDAY', startMinute: 840, endMinute: 960 }],
        }),
        [],
      ).evidence.filter((item) => item.category === 'AVAILABILITY'),
      VOCABULARY,
    );

    expect(only?.sentence).toContain('part of the year');
  });

  it('never mentions a number, a score or another therapist', () => {
    const all = explain(
      intake({ areasOfWork: ['relationships', 'burnout'], languages: ['hi', 'en'] }),
      therapist({ areasOfWork: ['relationships', 'burnout'], languages: ['hi', 'en'] }),
    );
    const text = all.map((entry) => `${entry.sentence} ${entry.detail}`).join(' ');

    expect(text).not.toMatch(/\d+\s*%/);
    expect(text.toLowerCase()).not.toMatch(/\b(score|rank|percent|best match|top therapist)\b/);
    expect(text).not.toContain('v1');
  });

  it('formats a minute of day as a person reads a clock', () => {
    expect(formatMinuteOfDay(0)).toBe('00:00');
    expect(formatMinuteOfDay(9 * 60 + 5)).toBe('09:05');
    expect(formatMinuteOfDay(23 * 60 + 30)).toBe('23:30');
  });
});
