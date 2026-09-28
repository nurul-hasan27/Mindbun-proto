import { describe, expect, it, vi, type MockedFunction } from 'vitest';
import { buildApp } from '../../../app.js';
import type {
  MatchRepository,
  MatchableIntake,
  StoredRun,
} from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';

/**
 * The route under test with the engine behind fake stores, so these tests are about
 * the HTTP contract — statuses, bodies, and what is *not* in a body — rather than
 * about matching. The engine's own behaviour is covered in `matchEngine.test.ts`.
 */

const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const CLIENT_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb';
const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';

const MATCHABLE: MatchableIntake = {
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
      windows: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1260 }],
    },
    markedAsRequirements: false,
  },
};

const STORED_RUN: StoredRun = {
  intakeId: INTAKE_ID,
  engineVersion: 'v1',
  createdAt: '2026-09-30T09:00:00.000Z',
  considered: 50,
  recommendation: {
    matchId: MATCH_ID,
    intakeId: INTAKE_ID,
    therapistId: THERAPIST_ID,
    engineVersion: 'v1',
    createdAt: '2026-09-30T09:00:00.000Z',
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
        category: 'AVAILABILITY',
        strength: 'PREFERENCE',
        clientKey: 'TUESDAY 1080-1260',
        therapistKey: 'TUESDAY 1020-1200',
        explanation: 'AVAILABILITY_OVERLAP',
        weight: 20,
        overlap: {
          dayOfWeek: 'TUESDAY',
          startMinute: 1080,
          endMinute: 1200,
          therapistDayOfWeek: 'TUESDAY',
          therapistStartMinute: 1020,
          therapistEndMinute: 1140,
          weeks: ['winter', 'summer'],
        },
      },
    ],
  },
};

const THERAPIST = {
  id: THERAPIST_ID,
  displayName: 'Ananya Mehra',
  headline: 'Warm, curious, reflective',
  bio: 'A bi about warmth and patience.',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 8,
  languages: [{ key: 'hi', name: 'Hindi' }],
  areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
  communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
  approaches: [{ key: 'integrative', name: 'Integrative' }],
  contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
  sessionFormats: [{ key: 'online', name: 'Online' }],
  availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1200 }],
};

interface Fakes {
  readonly matches: MatchRepository;
  readonly therapists: TherapistRepository;
  readonly loadMatchableIntake: MockedFunction<MatchRepository['loadMatchableIntake']>;
  readonly saveRun: MockedFunction<MatchRepository['saveRun']>;
  readonly findRun: MockedFunction<MatchRepository['findRun']>;
}

function fakes(overrides: Partial<Record<keyof MatchRepository, unknown>> = {}): Fakes {
  const loadMatchableIntake = vi.fn(() => Promise.resolve(MATCHABLE));
  const saveRun = vi.fn(() => Promise.resolve(STORED_RUN));
  const findRun = vi.fn(() => Promise.resolve<StoredRun | null>(null));

  const matches = {
    loadMatchableIntake,
    listCandidates: () =>
      Promise.resolve([
        {
          id: THERAPIST_ID,
          displayName: 'Ananya Mehra',
          timezone: 'Asia/Kolkata',
          areasOfWork: ['relationships'],
          communicationStyles: ['exploratory'],
          approaches: ['integrative'],
          contextualExperience: ['indian-diaspora'],
          languages: ['hi'],
          sessionFormats: ['online'],
          availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1200 }],
        },
      ]),
    saveRun,
    findRun,
    readVocabularyNames: () =>
      Promise.resolve(
        new Map([
          ['hi', 'Hindi'],
          ['relationships', 'Relationships'],
          ['indian-diaspora', 'Indian diaspora'],
          ['exploratory', 'Exploratory'],
          ['online', 'Online'],
          ['integrative', 'Integrative'],
        ]),
      ),
    ...overrides,
  } as unknown as MatchRepository;

  const therapists = {
    list: () => Promise.resolve({ items: [], total: 0 }),
    findById: () => Promise.resolve(THERAPIST),
    hasLanguage: () => Promise.resolve(true),
    hasArea: () => Promise.resolve(true),
  } as unknown as TherapistRepository;

  return { matches, therapists, loadMatchableIntake, saveRun, findRun };
}

function appWith(built: Fakes) {
  return buildApp({ matches: built.matches, therapists: built.therapists });
}

type Payload = string | readonly unknown[] | Readonly<Record<string, unknown>>;

async function post(built: Fakes, payload: Payload) {
  return appWith(built).inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: { 'content-type': 'application/json' },
    payload,
  });
}

describe('POST /api/v1/matches', () => {
  it('answers with one person and the reasons', async () => {
    const built = fakes();
    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      matchId: string;
      decidedAt: string;
      therapist: { displayName: string };
      whyThisMatch: { key: string; sentence: string; detail: string }[];
    }>();

    expect(body.matchId).toBe(MATCH_ID);
    expect(body.therapist.displayName).toBe('Ananya Mehra');
    expect(body.whyThisMatch.length).toBeGreaterThan(0);
    expect(body.whyThisMatch[0]?.sentence).toContain('Hindi');
  });

  it('takes only an intake reference, and says so when given more', async () => {
    // A caller cannot name a therapist and ask for a match. The decision is the
    // server's, and the refusal explains that rather than being a bare 400 — Fastify
    // would otherwise strip the extra field and answer as if it had not been sent.
    const built = fakes();

    for (const extra of [{ therapistId: THERAPIST_ID }, { matchId: MATCH_ID }, { score: 100 }]) {
      const response = await post(built, { intakeId: INTAKE_ID, ...extra });

      expect(response.statusCode, JSON.stringify(extra)).toBe(400);
      expect(response.json<{ message: string }>().message).toMatch(/cannot be asked for directly/i);
    }

    expect(built.saveRun).not.toHaveBeenCalled();
  });

  it('records every candidate, not only the one it recommends', async () => {
    const built = fakes();
    await post(built, { intakeId: INTAKE_ID });

    const saved = built.saveRun.mock.calls[0]?.[0];

    expect(saved?.evaluations).toHaveLength(1);
    expect(saved?.engineVersion).toBe('v1');
    expect(saved?.clientId).toBe(CLIENT_ID);
  });

  it('stores a score, and never sends one', async () => {
    const built = fakes();
    const response = await post(built, { intakeId: INTAKE_ID });

    // The number exists internally...
    const saved = built.saveRun.mock.calls[0]?.[0];
    expect(typeof saved?.evaluations[0]?.score).toBe('number');

    // ...and there is nowhere in the body for it to be.
    expect(response.body).not.toMatch(/"score"/);
    expect(response.body).not.toMatch(/"rejectionCode"/);
    expect(response.body).not.toMatch(/"engineVersion"/);
  });

  it('never sends a ranking, another candidate, or a percentage', async () => {
    const built = fakes();
    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.body).not.toMatch(/%/);
    expect(response.body).not.toMatch(/rank|score|candidate/i);
    // One therapist's name, and one therapist's object.
    expect(response.body.match(/"displayName"/g)).toHaveLength(1);
  });

  it('never sends the client own words or any answer they gave', async () => {
    const built = fakes();
    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.body).not.toContain(INTAKE_ID);
    expect(response.body).not.toContain(CLIENT_ID);
    expect(response.body).not.toMatch(/rawText|openToGuidance/);
  });

  it('explains a shared time in the client own clock, in words', async () => {
    const built = fakes();
    const response = await post(built, { intakeId: INTAKE_ID });
    const body = response.json<{ whyThisMatch: { key: string; sentence: string }[] }>();
    const availability = body.whyThisMatch.find((item) => item.key === 'AVAILABILITY_OVERLAP');

    expect(availability?.sentence).toContain('your time');
    expect(availability?.sentence).toContain('18:00');
  });

  it('serves a stored decision again rather than running the engine twice', async () => {
    const built = fakes({ findRun: vi.fn(() => Promise.resolve(STORED_RUN)) });

    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.statusCode).toBe(200);
    expect(built.saveRun).not.toHaveBeenCalled();
    expect(response.json<{ matchId: string }>().matchId).toBe(MATCH_ID);
  });

  it('answers 200 with an outcome when nothing qualified', async () => {
    const nothingQualified: StoredRun = {
      intakeId: INTAKE_ID,
      engineVersion: 'v1',
      createdAt: '2026-09-30T09:00:00.000Z',
      considered: 50,
      recommendation: null,
    };
    const built = fakes({ findRun: vi.fn(() => Promise.resolve(nothingQualified)) });

    const response = await post(built, { intakeId: INTAKE_ID });

    // Not a 404: nobody asked for something missing, they asked a question and the
    // answer is "not yet".
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: 'no_candidate', considered: 50 });
  });

  it('answers 404 for an intake it has never seen', async () => {
    const built = fakes({ loadMatchableIntake: vi.fn(() => Promise.resolve(null)) });

    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ message: string }>().message).toMatch(/do not have an intake/i);
  });

  it('answers 400 for a reference that is not one', async () => {
    const built = fakes();

    for (const intakeId of ['not-a-uuid', '', 42, null, undefined]) {
      const response = await post(built, { intakeId });

      expect(response.statusCode, String(intakeId)).toBe(400);
    }

    expect(built.loadMatchableIntake).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not an object at all', async () => {
    const built = fakes();

    for (const payload of ['"a string"', '42', '["an","array"]', 'true']) {
      const response = await post(built, payload);

      expect(response.statusCode, payload).toBe(400);
      expect(response.json<{ message: string }>().message.length).toBeGreaterThan(10);
    }

    expect(built.loadMatchableIntake).not.toHaveBeenCalled();
  });

  it('answers 503 when the store cannot be reached', async () => {
    const built = fakes({
      loadMatchableIntake: vi.fn(() => Promise.reject(new DataStoreUnavailableError('down'))),
    });

    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ message: string }>().message).toMatch(/could not reach/i);
  });

  it('never puts a connection string or an answer into a failure body', async () => {
    const built = fakes({
      loadMatchableIntake: vi.fn(() =>
        Promise.reject(
          new DataStoreUnavailableError(
            'postgres://wtm:wtm@127.0.0.1:5432/why_this_match while matching hindi',
          ),
        ),
      ),
    });

    const response = await post(built, { intakeId: INTAKE_ID });

    expect(response.body).not.toContain('postgres');
    expect(response.body).not.toContain('hindi');
    expect(response.body).not.toContain('wtm');
  });

  it('answers 503 when the service was started without a store', async () => {
    const response = await buildApp().inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { intakeId: INTAKE_ID },
    });

    expect(response.statusCode).toBe(503);
  });
});
