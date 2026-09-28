import { describe, expect, it, vi, type MockedFunction } from 'vitest';
import { buildApp } from '../../../app.js';
import type {
  FeedbackRepository,
  MatchHeader,
  RecordFeedbackInput,
} from '../../../data/matching/feedbackRepository.js';
import type { RematchContext, StoredFeedback } from '../../../data/matching/feedbackTypes.js';
import type { MatchRepository, StoredRun } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';

/**
 * The HTTP contract for feedback and rematching, with the engine behind fake stores.
 *
 * The tests here are mostly about what the endpoint *refuses*, because the whole
 * security model of this phase is structural: every identifier is derived from a
 * `matchId`, so the interesting question is not "does it check the client id" but "is
 * there anywhere a caller could put one".
 */

const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const OTHER_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb';
const CLIENT_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';
const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ee';
const DECLINED_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f0';
const FEEDBACK_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f1';

const REASON_KEYS = new Set([
  'communication-mismatch',
  'different-experience',
  'not-the-right-approach',
  'felt-uncomfortable',
  'availability-mismatch',
  'language-mismatch',
  'format-mismatch',
  'other',
]);

const HEADER: MatchHeader = {
  matchId: MATCH_ID,
  intakeId: INTAKE_ID,
  clientId: CLIENT_ID,
  therapistId: DECLINED_THERAPIST_ID,
  attempt: 1,
  status: 'RECOMMENDED',
  isRecommended: true,
};

const CONTEXT: RematchContext = {
  matchId: MATCH_ID,
  intakeId: INTAKE_ID,
  clientId: CLIENT_ID,
  therapistId: DECLINED_THERAPIST_ID,
  attempt: 1,
  nextAttempt: 2,
  declinedTherapistIds: [],
  hasLaterAttempt: false,
  hasFeedback: true,
};

const STORED_FEEDBACK: StoredFeedback = {
  id: FEEDBACK_ID,
  clientId: CLIENT_ID,
  intakeId: INTAKE_ID,
  therapistId: DECLINED_THERAPIST_ID,
  matchId: MATCH_ID,
  reasonKeys: ['communication-mismatch'],
  rawText: null,
  createdAt: '2026-10-05T12:00:00.000Z',
  recordedAt: '2026-10-05T12:00:00.000Z',
};

const CANDIDATE = {
  id: THERAPIST_ID,
  displayName: 'Aditi Raghunathan',
  timezone: 'Asia/Kolkata',
  areasOfWork: ['relationships'],
  communicationStyles: ['exploratory'],
  approaches: ['integrative'],
  contextualExperience: ['indian-diaspora'],
  languages: ['hi'],
  sessionFormats: ['online'],
  availability: [{ dayOfWeek: 'TUESDAY' as const, startMinute: 1020, endMinute: 1200 }],
};

const REMATCH_RUN: StoredRun = {
  intakeId: INTAKE_ID,
  attempt: 2,
  engineVersion: 'v1',
  createdAt: '2026-10-05T12:05:00.000Z',
  considered: 50,
  recommendation: {
    matchId: OTHER_MATCH_ID,
    intakeId: INTAKE_ID,
    therapistId: THERAPIST_ID,
    engineVersion: 'v1',
    createdAt: '2026-10-05T12:05:00.000Z',
    evidence: [
      {
        category: 'LANGUAGE',
        strength: 'REQUIREMENT',
        clientKey: 'hi',
        therapistKey: 'hi',
        explanation: 'REQUIRED_LANGUAGE',
        weight: 30,
      },
      {
        category: 'COMMUNICATION_STYLE',
        strength: 'PREFERENCE',
        clientKey: 'exploratory',
        therapistKey: 'exploratory',
        explanation: 'COMMUNICATION_STYLE',
        weight: 40,
      },
    ],
  },
};

const THERAPIST = {
  id: THERAPIST_ID,
  displayName: 'Aditi Raghunathan',
  headline: 'Warm, curious, reflective',
  bio: 'A biography.',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 9,
  languages: [{ key: 'hi', name: 'Hindi' }],
  areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
  communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
  approaches: [{ key: 'integrative', name: 'Integrative' }],
  contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
  sessionFormats: [{ key: 'online', name: 'Online' }],
  availability: [{ dayOfWeek: 'TUESDAY' as const, startMinute: 1020, endMinute: 1200 }],
};

const DECLINED_THERAPIST = {
  ...THERAPIST,
  id: DECLINED_THERAPIST_ID,
  displayName: 'Tara Joshi',
  communicationStyles: [{ key: 'direct', name: 'Direct' }],
};

interface Fakes {
  readonly feedback: FeedbackRepository;
  readonly matches: MatchRepository;
  readonly therapists: TherapistRepository;
  readonly recordFeedback: MockedFunction<FeedbackRepository['recordFeedback']>;
  readonly saveRun: MockedFunction<MatchRepository['saveRun']>;
  readonly findMatch: MockedFunction<FeedbackRepository['findMatch']>;
  readonly loadRematchContext: MockedFunction<FeedbackRepository['loadRematchContext']>;
}

/**
 * Knobs, not partial repositories.
 *
 * Taking a `Partial<FeedbackRepository>` and spreading it over the fakes means an
 * override silently replaces a mock the test then cannot reach, which is a trap: a
 * test asserts on the mock, the route calls the replacement, and the assertion passes
 * for the wrong reason. Named knobs cannot do that.
 */
interface FakeKnobs {
  /** What `findMatch` answers. `null` is the "no such match" case. */
  readonly match?: MatchHeader | null;
  readonly feedbackRow?: StoredFeedback | null;
  /** An override for the whole rematch context, for the 409 cases. */
  readonly context?: Partial<RematchContext> | null;
  readonly candidates?: readonly ComparisonCandidateLike[];
  /** What `saveRun` answers, for the exhausted-pool case. */
  readonly run?: StoredRun;
}

interface ComparisonCandidateLike {
  readonly id: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly approaches: readonly string[];
  readonly contextualExperience: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
  readonly availability: readonly {
    dayOfWeek: 'TUESDAY';
    startMinute: number;
    endMinute: number;
  }[];
}

function fakes(knobs: FakeKnobs = {}): Fakes {
  // `'match' in knobs` rather than `??`, because `null` is itself a meaningful answer
  // here — the "no such match" case — and `??` would quietly replace it with the
  // default and make the test assert the opposite of what it says.
  const findMatch = vi.fn(() =>
    Promise.resolve<MatchHeader | null>('match' in knobs ? (knobs.match ?? null) : HEADER),
  );
  const recordFeedback = vi.fn((input: RecordFeedbackInput) =>
    Promise.resolve<StoredFeedback>({ ...STORED_FEEDBACK, matchId: input.matchId }),
  );
  const loadRematchContext = vi.fn(() =>
    Promise.resolve<RematchContext | null>(
      knobs.context === undefined
        ? CONTEXT
        : knobs.context === null
          ? null
          : { ...CONTEXT, ...knobs.context },
    ),
  );
  const findFeedback = vi.fn(() =>
    Promise.resolve<StoredFeedback | null>(
      'feedbackRow' in knobs ? (knobs.feedbackRow ?? null) : STORED_FEEDBACK,
    ),
  );
  const saveRun = vi.fn(() => Promise.resolve(knobs.run ?? REMATCH_RUN));
  const storedEvidence = REMATCH_RUN.recommendation?.evidence ?? [];
  const readMatchEvidence = vi.fn(() => Promise.resolve(storedEvidence));
  const readComparisonCandidate = vi.fn((therapistId: string) =>
    Promise.resolve(therapistId === DECLINED_THERAPIST_ID ? DECLINED_THERAPIST : CANDIDATE),
  );
  const readReasons = vi.fn(() =>
    Promise.resolve([...[...REASON_KEYS].map((key) => ({ key, name: key, description: '' }))]),
  );

  // The mocks return concrete fixture objects rather than the interface's declared
  // types, so the assertion is doing real work: it is the boundary between "what the
  // test happens to have" and "what the port promises".
  const feedback = {
    findMatch,
    findFeedback,
    recordFeedback,
    loadRematchContext,
    readMatchEvidence,
    readComparisonCandidate,
    readReasons,
  } as unknown as FeedbackRepository;

  const matches = {
    loadMatchableIntake: () =>
      Promise.resolve({
        intakeId: INTAKE_ID,
        clientId: CLIENT_ID,
        intake: {
          areasOfWork: ['relationships'],
          communicationStyles: ['exploratory'],
          openToGuidance: false,
          approaches: [],
          contextualExperiences: ['indian-diaspora'],
          languages: ['hi'],
          sessionFormats: ['online'],
          availability: {
            timezone: 'Asia/Kolkata',
            windows: [{ dayOfWeek: 'TUESDAY' as const, startMinute: 1080, endMinute: 1260 }],
          },
          markedAsRequirements: false,
        },
      }),
    // The declined therapist is in the list, as they would be in reality — they are one
    // of the fifty. The exclusion is what takes them out, not their absence.
    listCandidates: () =>
      Promise.resolve(
        knobs.candidates ?? [
          CANDIDATE,
          { ...CANDIDATE, id: 'another' },
          { ...CANDIDATE, id: DECLINED_THERAPIST_ID, displayName: 'Tara Joshi' },
        ],
      ),
    saveRun,
    findRun: () => Promise.resolve<StoredRun | null>(null),
    findLatestRun: () => Promise.resolve<StoredRun | null>(null),
    findPreviousRun: () => Promise.resolve<StoredRun | null>(null),
    resolveNextAttempt: () => Promise.resolve({ attempt: 2, taken: false }),
    readVocabularyNames: () =>
      Promise.resolve(
        new Map([
          ['hi', 'Hindi'],
          ['exploratory', 'Exploratory'],
          ['relationships', 'Relationships'],
          ['indian-diaspora', 'Indian diaspora'],
        ]),
      ),
  };

  const therapists = {
    list: () => Promise.resolve({ items: [], total: 0 }),
    findById: (id: string) =>
      Promise.resolve(id === DECLINED_THERAPIST_ID ? DECLINED_THERAPIST : THERAPIST),
    hasLanguage: () => Promise.resolve(true),
    hasArea: () => Promise.resolve(true),
  } as unknown as TherapistRepository;

  return {
    feedback,
    matches,
    therapists,
    recordFeedback,
    saveRun,
    findMatch,
    loadRematchContext,
  };
}

function appWith(built: Fakes) {
  return buildApp({
    feedback: built.feedback,
    matches: built.matches,
    therapists: built.therapists,
  });
}

type Payload = string | readonly unknown[] | Readonly<Record<string, unknown>>;

function postFeedback(built: Fakes, matchId: string, payload: Payload) {
  return appWith(built).inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/feedback`,
    headers: { 'content-type': 'application/json' },
    payload,
  });
}

/**
 * A rematch carries nothing at all — not even an empty object.
 *
 * The `content-type` header is omitted with the body, because Fastify refuses a
 * `application/json` request that has no body, and the client is written the same way.
 * That is deliberate: this endpoint takes no input beyond the match id, so there is no
 * JSON for the browser to send.
 */
function postRematch(built: Fakes, matchId: string, payload?: Payload) {
  return appWith(built).inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/rematch`,
    ...(payload === undefined ? {} : { headers: { 'content-type': 'application/json' }, payload }),
  });
}

describe('POST /api/v1/matches/:matchId/feedback', () => {
  it('records a reason and answers with a receipt', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['communication-mismatch'],
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ feedbackId: string; reasons: string[] }>()).toMatchObject({
      feedbackId: FEEDBACK_ID,
      reasons: ['communication-mismatch'],
    });
  });

  it('accepts several reasons, because several can be true at once', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['communication-mismatch', 'availability-mismatch'],
    });

    expect(response.statusCode).toBe(201);
  });

  it('accepts an optional note and does not require one', async () => {
    const built = fakes();

    const withNote = await postFeedback(built, MATCH_ID, {
      reasons: ['other'],
      rawText: 'I could not say what I wanted to say.',
    });
    const without = await postFeedback(built, MATCH_ID, { reasons: ['other'] });

    expect(withNote.statusCode).toBe(201);
    expect(without.statusCode).toBe(201);
  });

  it('treats an empty note as no note at all', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['other'],
      rawText: '   ',
    });

    expect(response.statusCode).toBe(201);
  });

  it('refuses an empty submission with a sentence', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, { reasons: [] });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/at least one reason/i);
    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('refuses a submission with no reasons field at all', async () => {
    const built = fakes();

    expect((await postFeedback(built, MATCH_ID, {})).statusCode).toBe(400);
    expect((await postFeedback(built, MATCH_ID, { rawText: 'hello' })).statusCode).toBe(400);
  });

  it('refuses a reason the product does not offer', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, { reasons: ['because-i-said-so'] });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/not one of the reasons/i);
    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('refuses a note that is too long, and does not store a truncated one', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['other'],
      rawText: 'x'.repeat(3_000),
    });

    expect(response.statusCode).toBe(400);
    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('answers 404 for a match it has never seen, and writes nothing', async () => {
    const built = fakes({ match: null });

    const response = await postFeedback(built, MATCH_ID, { reasons: ['other'] });

    expect(response.statusCode).toBe(404);
    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('answers 400 for an id that is not one', async () => {
    const built = fakes();

    for (const id of ['not-a-uuid', '123', '%20']) {
      const response = await postFeedback(built, id, { reasons: ['other'] });
      expect(response.statusCode, id).toBe(400);
    }

    expect(built.findMatch).not.toHaveBeenCalled();
  });

  it('answers 503 when the store cannot be reached, with nothing technical in it', async () => {
    const built = fakes({ match: null });
    vi.mocked(built.findMatch).mockRejectedValue(new DataStoreUnavailableError('down'));

    const response = await postFeedback(built, MATCH_ID, { reasons: ['other'] });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ message: string }>().message).toMatch(/could not reach/i);
    expect(response.body).not.toMatch(/down|postgres|at Object/i);
  });
});

describe('what the browser cannot submit', () => {
  it('refuses a client id, and explains that it is worked out server-side', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['other'],
      clientId: 'somebody-else',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/work(ed)? out/i);
    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('refuses a therapist id, which would be a request for a specific person', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['other'],
      therapistId: THERAPIST_ID,
    });

    expect(response.statusCode).toBe(400);
    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('refuses an exclusion list, so nobody can steer the search', async () => {
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, {
      reasons: ['other'],
      excludedTherapistIds: [THERAPIST_ID],
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a weight or a score, so nothing can buy priority', async () => {
    const built = fakes();

    for (const field of ['weight', 'score', 'boost', 'rank', 'engineVersion', 'attempt']) {
      const response = await postFeedback(built, MATCH_ID, {
        reasons: ['other'],
        [field]: 10_000,
      });

      expect(response.statusCode, field).toBe(400);
    }

    expect(built.recordFeedback).not.toHaveBeenCalled();
  });

  it('derives the client, the intake and the therapist from the match', async () => {
    // The single structural guarantee: nothing in the body can name anyone, so the only
    // way to write a complaint against a match is to have that match's id.
    const built = fakes();

    await postFeedback(built, MATCH_ID, { reasons: ['communication-mismatch'] });

    const written = built.recordFeedback.mock.calls[0]?.[0];

    // The adapter reads the triple off the match inside its transaction; the service
    // only ever passes the id.
    expect(written).toEqual({
      matchId: MATCH_ID,
      reasons: ['communication-mismatch'],
      rawText: null,
    });
  });
});

describe('POST /api/v1/matches/:matchId/rematch', () => {
  it('answers with the new person, the reasons and what changed', async () => {
    const built = fakes();

    const response = await postRematch(built, MATCH_ID);

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      matchId: string;
      attempt: number;
      previousTherapistName: string;
      therapist: { displayName: string };
      whyThisMatch: { key: string; sentence: string }[];
      whatChanged: { category: string; sentence: string }[];
      adjustedFor: string[];
    }>();

    expect(body.matchId).toBe(OTHER_MATCH_ID);
    expect(body.attempt).toBe(2);
    expect(body.previousTherapistName).toBe('Tara Joshi');
    expect(body.therapist.displayName).toBe('Aditi Raghunathan');
    expect(body.whyThisMatch.length).toBeGreaterThan(0);
    expect(body.adjustedFor).toEqual(['communication-mismatch']);
  });

  it('records the therapist who was turned down as set aside, with a reason', async () => {
    // The observable consequence of the exclusion: the declined therapist is still in
    // the pass, marked ineligible with a code that says why. A candidate that vanished
    // without a trace would be indistinguishable from one who was never in the list, and
    // "not this one" is a decision the record has to hold.
    const built = fakes();

    await postRematch(built, MATCH_ID);

    const written = built.saveRun.mock.calls[0]?.[0];
    const declined = written?.evaluations.filter(
      (entry) => entry.rejectionCode === 'DECLINED_PREVIOUSLY',
    );

    expect(written?.attempt).toBe(2);
    expect(declined?.map((entry) => entry.therapistId)).toContain(DECLINED_THERAPIST_ID);
  });

  it('writes the new pass and leaves the first one alone', async () => {
    const built = fakes();

    await postRematch(built, MATCH_ID);

    const written = built.saveRun.mock.calls[0]?.[0];

    expect(written?.attempt).toBe(2);
    // The winner is a new row, not a rewrite.
    expect(written?.evaluations.find((entry) => entry.status === 'RECOMMENDED')?.therapistId).toBe(
      THERAPIST_ID,
    );
  });

  it('refuses a rematch with no reason given, which is the thing this phase prevents', async () => {
    const built = fakes({ context: { hasFeedback: false } });

    const response = await postRematch(built, MATCH_ID);

    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/tell us what did not fit/i);
    expect(built.saveRun).not.toHaveBeenCalled();
  });

  it('answers 409 when a later pass already exists, and says where to go', async () => {
    const built = fakes({ context: { hasLaterAttempt: true } });

    const response = await postRematch(built, MATCH_ID);

    // Not an error the person can do anything about, so the reply is the way forward.
    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/already looked past/i);
    expect(built.saveRun).not.toHaveBeenCalled();
  });

  it('answers 404 for a match it has never seen, writing nothing', async () => {
    const built = fakes({ context: null });

    const response = await postRematch(built, MATCH_ID);

    expect(response.statusCode).toBe(404);
    expect(built.saveRun).not.toHaveBeenCalled();
  });

  it('answers 200 with an outcome when the pool is exhausted', async () => {
    // Every candidate excluded, so the engine returns no recommendation — and the pass
    // is still written, with all of them recorded as already declined.
    const built = fakes({
      // Everyone already declined, so the engine has nobody to offer.
      context: { declinedTherapistIds: [THERAPIST_ID] },
      candidates: [CANDIDATE],
      run: {
        intakeId: INTAKE_ID,
        attempt: 2,
        engineVersion: 'v1',
        createdAt: '2026-10-05T12:05:00.000Z',
        considered: 1,
        recommendation: null,
      },
    });

    const response = await postRematch(built, MATCH_ID);

    // Nobody left is an answer, not a failure: the person asked a question and "there is
    // nobody else" is the answer. A 404 would invite the page to say "not found" instead.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: 'no_candidate', considered: 0 });
    expect(built.saveRun).toHaveBeenCalled();
  });

  it('answers 400 for an id that is not one', async () => {
    const built = fakes();

    expect((await postRematch(built, 'nope')).statusCode).toBe(400);
    expect(built.loadRematchContext).not.toHaveBeenCalled();
  });

  it('refuses a body at all, because there is nothing for a caller to say here', async () => {
    const built = fakes();

    for (const payload of [
      { therapistId: THERAPIST_ID },
      { excludedTherapistIds: [THERAPIST_ID] },
      { score: 100 },
      { attempt: 99 },
      { reasons: ['other'] },
    ]) {
      const response = await postRematch(built, MATCH_ID, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }

    expect(built.loadRematchContext).not.toHaveBeenCalled();
  });

  it('answers 503 when the store cannot be reached', async () => {
    const built = fakes();
    vi.mocked(built.loadRematchContext).mockRejectedValue(new DataStoreUnavailableError('down'));

    expect((await postRematch(built, MATCH_ID)).statusCode).toBe(503);
  });
});

describe('what a rematch response never contains', () => {
  it('has no score, no weight, no rank and no percentage', async () => {
    const built = fakes();

    const response = await postRematch(built, MATCH_ID);

    expect(response.body).not.toMatch(
      /"score"|"rejectionCode"|"engineVersion"|"weight"|"ordinal"|"increments"|%/.source,
    );
  });

  it('names one therapist, and the one the client already saw', async () => {
    const built = fakes();

    const response = await postRematch(built, MATCH_ID);

    // Two names is right: the new one, and the person they are being moved away from.
    // A third would be a shortlist.
    expect(response.body.match(/"displayName"/g)).toHaveLength(1);
    expect(response.body).toContain('previousTherapistName');
  });

  it('carries no client identifier and nothing the client wrote', async () => {
    const built = fakes();

    const response = await postRematch(built, MATCH_ID);

    expect(response.body).not.toContain(INTAKE_ID);
    expect(response.body).not.toContain(CLIENT_ID);
    expect(response.body).not.toContain(MATCH_ID);
  });

  it('carries no candidate list, no exclusion list and no declined therapist id', async () => {
    const built = fakes();

    const response = await postRematch(built, MATCH_ID);

    expect(response.body).not.toMatch(/excluded|candidates|declinedTherapist/i);
    // The therapist who was turned down is named, but their id is not.
    expect(response.body).toContain('Tara Joshi');
    expect(response.body).not.toContain(DECLINED_THERAPIST_ID);
  });
});

describe('feedback cannot be filed against someone else’s match', () => {
  it('looks the match up exactly once, and there is no ownership branch to differ on', async () => {
    // "Not yours" and "no such thing" cannot be told apart here, and that is the design
    // rather than an accident of wording. There is nothing to compare ownership
    // *against* — no client id reaches this handler — so the single lookup is the only
    // gate, and a caller who could distinguish the two cases would have an enumeration
    // oracle: they could confirm an id exists by asking about someone else's.
    const built = fakes();

    await postFeedback(built, OTHER_MATCH_ID, { reasons: ['other'] });

    expect(built.findMatch).toHaveBeenCalledTimes(1);
    const [lookedUp] = built.findMatch.mock.calls[0] ?? [];
    expect(lookedUp).toBe(OTHER_MATCH_ID);
  });

  it('answers a missing match with one fixed sentence and nothing else', async () => {
    const built = fakes({ match: null });

    const response = await postFeedback(built, MATCH_ID, { reasons: ['other'] });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'We do not have a recommendation with that reference.',
    });
  });

  it('reveals nothing about a match that does exist', async () => {
    // A valid match answers 201 with a receipt that is entirely about the match and the
    // reasons — no client, no therapist, nothing that would differ between two people.
    const built = fakes();

    const response = await postFeedback(built, MATCH_ID, { reasons: ['other'] });

    expect(response.body).not.toContain(CLIENT_ID);
    expect(response.body).not.toContain(INTAKE_ID);
    expect(response.body).not.toContain(DECLINED_THERAPIST_ID);
  });
});

describe('when the service was started without a store', () => {
  it('answers 503 for a rematch', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${MATCH_ID}/rematch`,
    });

    expect(response.statusCode).toBe(503);
  });

  it('offers no reasons at all, so nothing can be filed by accident', async () => {
    // With no vocabulary, every reason is one we do not offer, and a named one is
    // refused with a `400` rather than recorded with nothing. A `503` would be the
    // tidier status, but it would be a lie: the request is refused on its own terms,
    // not because the store is unreachable, and the person is told so.
    //
    // The alternative — accepting anything — would let someone who found this endpoint
    // write reason keys that no rule in the engine has ever heard of.
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${MATCH_ID}/feedback`,
      payload: { reasons: ['communication-mismatch'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/not one of the reasons/i);
  });
});
