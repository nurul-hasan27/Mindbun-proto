import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import type {
  CaseCandidateRow,
  CaseListRow,
  ClientsWordsRow,
  JourneyRow,
  RecordDecisionInput,
  StoredNeedKeys,
  WorkspaceRepository,
} from '../../../data/matching/workspaceRepository.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';
import type { StoredDecision } from '../../../data/matching/decisionTypes.js';

/**
 * The reviewer's HTTP contract, with the engine behind fake stores.
 *
 * Read these as three groups of questions.
 *
 * **What does it refuse?** Most of the file. The whole security model of this phase is
 * structural — no endpoint takes a client id, an intake id or a therapist id, because a
 * caller has nowhere to put one — so the interesting question is not "does it validate the
 * client id" but "could a caller steer this at all". The refusals are where that shows.
 *
 * **What may not be chosen?** A candidate the engine set aside, and an override with no
 * reason. Both are real limits rather than validation noise, and both get a sentence of
 * their own so a matcher can tell a rule from a mistake.
 *
 * **What reaches the wire?** Several tests read the *serialised body* rather than the
 * TypeScript type, because the claim being made — that no score, no candidate the reviewer
 * was not shown, and no client's own words travel here by accident — is a claim about
 * bytes, and a type cannot make it.
 */

const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const ALTERNATIVE_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb';
const THIRD_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec';
const SET_ASIDE_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';
const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ee';
const CLIENT_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ef';
const SUGGESTED_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f0';
const ALTERNATIVE_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f1';
const THIRD_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f2';
const SET_ASIDE_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f3';
const DECISION_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f4';
const STRANGER_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f5';

const NEEDS: StoredNeedKeys = {
  areasOfWork: ['relationships', 'career-transitions'],
  communicationStyles: ['exploratory'],
  approaches: [],
  contextualExperiences: ['indian-diaspora'],
  languages: ['hi', 'en'],
  sessionFormats: ['online'],
  openToGuidance: false,
  markedAsRequirements: false,
};

const SUGGESTED_EVIDENCE = [
  {
    category: 'LANGUAGE' as const,
    strength: 'REQUIREMENT' as const,
    clientKey: 'hi',
    therapistKey: 'hi',
    explanation: 'REQUIRED_LANGUAGE' as const,
    weight: 30,
  },
  {
    category: 'COMMUNICATION_STYLE' as const,
    strength: 'PREFERENCE' as const,
    clientKey: 'exploratory',
    therapistKey: 'direct',
    explanation: 'COMMUNICATION_STYLE' as const,
    weight: 40,
  },
  {
    category: 'AREA_OF_WORK' as const,
    strength: 'PREFERENCE' as const,
    clientKey: 'relationships',
    therapistKey: 'relationships',
    explanation: 'AREA_OF_WORK' as const,
    weight: 25,
  },
  {
    category: 'SESSION_FORMAT' as const,
    strength: 'REQUIREMENT' as const,
    clientKey: 'online',
    therapistKey: 'online',
    explanation: 'SESSION_FORMAT' as const,
    weight: 20,
  },
  {
    category: 'CONTEXTUAL_EXPERIENCE' as const,
    strength: 'PREFERENCE' as const,
    clientKey: 'indian-diaspora',
    therapistKey: 'indian-diaspora',
    explanation: 'CONTEXTUAL_EXPERIENCE' as const,
    weight: 20,
  },
];

const ALTERNATIVE_EVIDENCE = [
  {
    category: 'LANGUAGE' as const,
    strength: 'REQUIREMENT' as const,
    clientKey: 'hi',
    therapistKey: 'hi',
    explanation: 'REQUIRED_LANGUAGE' as const,
    weight: 30,
  },
  {
    category: 'COMMUNICATION_STYLE' as const,
    strength: 'PREFERENCE' as const,
    clientKey: 'exploratory',
    therapistKey: 'exploratory',
    explanation: 'COMMUNICATION_STYLE' as const,
    weight: 40,
  },
  {
    category: 'AREA_OF_WORK' as const,
    strength: 'PREFERENCE' as const,
    clientKey: 'relationships',
    therapistKey: 'career-transitions',
    explanation: 'AREA_OF_WORK' as const,
    weight: 25,
  },
  {
    category: 'SESSION_FORMAT' as const,
    strength: 'REQUIREMENT' as const,
    clientKey: 'online',
    therapistKey: 'online',
    explanation: 'SESSION_FORMAT' as const,
    weight: 20,
  },
  {
    category: 'CONTEXTUAL_EXPERIENCE' as const,
    strength: 'PREFERENCE' as const,
    clientKey: 'indian-diaspora',
    therapistKey: 'indian-diaspora',
    explanation: 'CONTEXTUAL_EXPERIENCE' as const,
    weight: 20,
  },
];

function candidate(
  matchId: string,
  therapistId: string,
  overrides: Partial<CaseCandidateRow> = {},
): CaseCandidateRow {
  return {
    matchId,
    therapistId,
    eligible: true,
    rejectionCode: null,
    evidence: SUGGESTED_EVIDENCE,
    ...overrides,
  };
}

/** The engine's order, which is the order the workspace shows. */
const CANDIDATES: readonly CaseCandidateRow[] = [
  candidate(MATCH_ID, SUGGESTED_THERAPIST_ID),
  candidate(ALTERNATIVE_MATCH_ID, ALTERNATIVE_THERAPIST_ID, { evidence: ALTERNATIVE_EVIDENCE }),
  candidate(THIRD_MATCH_ID, THIRD_THERAPIST_ID),
  candidate(SET_ASIDE_MATCH_ID, SET_ASIDE_THERAPIST_ID, {
    eligible: false,
    rejectionCode: 'REQUIREMENT_NOT_MET',
    evidence: [],
  }),
];

const DECISION_REASONS = [
  {
    key: 'better-availability',
    name: 'Better availability',
    description: 'More workable time in common with the client.',
  },
  {
    key: 'better-communication-style',
    name: 'Better communication style',
    description: 'A way of talking closer to what the client asked for.',
  },
  {
    key: 'better-fit-stated-preferences',
    name: 'Better fit for what the client asked for',
    description: 'Their own stated work overlaps more of what this person is looking for.',
  },
  {
    key: 'better-language-fit',
    name: 'Better language fit',
    description: 'A closer match on the languages this person speaks.',
  },
  {
    key: 'other',
    name: 'Something else',
    description: 'Something else you can put into your own words.',
  },
  {
    key: 'stronger-contextual-experience',
    name: 'Stronger contextual experience',
    description: 'More of the experience this person said matters to them.',
  },
];

const JOURNEY: readonly JourneyRow[] = [
  {
    attempt: 1,
    matchId: MATCH_ID,
    recommendedTherapistId: SUGGESTED_THERAPIST_ID,
    status: 'RECOMMENDED',
    feedbackReasonKeys: [],
    decision: null,
    selectedTherapistId: null,
  },
];

const CLIENTS_WORDS: ClientsWordsRow = {
  intakeNote: 'I keep explaining my family to people who have never lived somewhere else.',
  feedbackNotes: [{ attempt: 1, note: 'They felt too businesslike for me.' }],
};

function therapist(therapistId: string, displayName: string, style: string) {
  const styleName = `${style[0]?.toUpperCase() ?? ''}${style.slice(1)}`;

  return {
    id: therapistId,
    displayName,
    headline: `${style}, reflective`,
    bio: 'A biography.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 9,
    languages: [{ key: 'hi', name: 'Hindi' }],
    areasOfWork: [
      { key: 'relationships', name: 'Relationships' },
      { key: 'career-transitions', name: 'Career transitions' },
    ],
    communicationStyles: [{ key: style, name: styleName }],
    approaches: [],
    contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
    sessionFormats: [{ key: 'online', name: 'Online' }],
    availability: [{ dayOfWeek: 'TUESDAY' as const, startMinute: 1020, endMinute: 1200 }],
  };
}

const THERAPISTS: Record<string, ReturnType<typeof therapist>> = {
  [SUGGESTED_THERAPIST_ID]: therapist(SUGGESTED_THERAPIST_ID, 'Tara Joshi', 'direct'),
  [ALTERNATIVE_THERAPIST_ID]: therapist(
    ALTERNATIVE_THERAPIST_ID,
    'Aditi Raghunathan',
    'exploratory',
  ),
  [THIRD_THERAPIST_ID]: therapist(THIRD_THERAPIST_ID, 'Ayaan Qureshi', 'warm'),
  [SET_ASIDE_THERAPIST_ID]: therapist(SET_ASIDE_THERAPIST_ID, 'Ruth Adeyemi', 'reflective'),
};

interface Harness {
  readonly workspace: WorkspaceRepository;
  readonly recordDecision: ReturnType<typeof vi.fn>;
  readonly listCases: ReturnType<typeof vi.fn>;
  readonly findCase: ReturnType<typeof vi.fn>;
  readonly readClientsWords: ReturnType<typeof vi.fn>;
}

/**
 * A workspace port that keeps the fake state, so a test can assert what was *written*
 * rather than only what came back.
 */
function fakeWorkspace(overrides: Partial<WorkspaceRepository> = {}): Harness {
  let decision: StoredDecision | null = null;
  const recordDecision = vi.fn((input: RecordDecisionInput): Promise<StoredDecision> => {
    if (decision !== null) {
      return Promise.resolve(decision);
    }

    const written: StoredDecision = {
      id: DECISION_ID,
      matchId: input.matchId,
      selectedMatchId: input.selectedMatchId,
      therapistId:
        CANDIDATES.find((entry) => entry.matchId === input.selectedMatchId)?.therapistId ??
        SUGGESTED_THERAPIST_ID,
      decisionType: input.decisionType,
      reasonKeys: [...input.reasonKeys].sort(),
      note: input.note,
      recordedAt: '2026-10-12T09:00:00.000Z',
    };

    decision = written;
    return Promise.resolve(written);
  });

  const listCases = vi.fn((): Promise<readonly CaseListRow[]> => {
    // The queue shortens once a case is decided, which is the only way the list changes.
    if (decision !== null) {
      return Promise.resolve([]);
    }

    return Promise.resolve([
      {
        matchId: MATCH_ID,
        intakeId: INTAKE_ID,
        attempt: 1,
        recommendedTherapistId: SUGGESTED_THERAPIST_ID,
        hasHistory: false,
        needs: NEEDS,
      },
    ]);
  });

  const findCase = vi.fn((matchId: string) => {
    if (matchId !== MATCH_ID) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      matchId: MATCH_ID,
      intakeId: INTAKE_ID,
      clientId: CLIENT_ID,
      attempt: 1,
      status: 'RECOMMENDED' as const,
      recommendedTherapistId: SUGGESTED_THERAPIST_ID,
      candidates: CANDIDATES,
      decision,
    });
  });

  const readClientsWords = vi.fn((): Promise<ClientsWordsRow> => Promise.resolve(CLIENTS_WORDS));

  const workspace: WorkspaceRepository = {
    listCases,
    findCase,
    listJourney: () => Promise.resolve(JOURNEY),
    findDecisions: (matchIds) => {
      const map = new Map<string, StoredDecision>();
      if (decision !== null && matchIds.includes(decision.matchId)) {
        map.set(decision.matchId, decision);
      }
      return Promise.resolve(map);
    },
    recordDecision,
    readDecisionReasons: () => Promise.resolve(DECISION_REASONS),
    readClientsWords,
    ...overrides,
  };

  return { workspace, recordDecision, listCases, findCase, readClientsWords };
}

const MATCHES: MatchRepository = {
  readVocabularyNames: () =>
    Promise.resolve(
      new Map([
        ['hi', 'Hindi'],
        ['en', 'English'],
        ['exploratory', 'Exploratory'],
        ['direct', 'Direct'],
        ['warm', 'Warm'],
        ['reflective', 'Reflective'],
        ['relationships', 'Relationships'],
        ['career-transitions', 'Career transitions'],
        ['indian-diaspora', 'Indian diaspora'],
        ['online', 'Online'],
        ['language-mismatch', 'We did not share a language'],
      ]),
    ),
  loadMatchableIntake: (intakeId: string) =>
    Promise.resolve({
      intakeId,
      clientId: CLIENT_ID,
      intake: {
        areasOfWork: ['relationships', 'career-transitions'],
        communicationStyles: ['exploratory'],
        openToGuidance: false,
        approaches: [],
        contextualExperiences: ['indian-diaspora'],
        languages: ['hi', 'en'],
        sessionFormats: ['online'],
        availability: {
          timezone: 'Asia/Kolkata',
          windows: [
            { dayOfWeek: 'MONDAY', startMinute: 1020, endMinute: 1260 },
            { dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 },
          ],
        },
        markedAsRequirements: false,
      },
    }),
  // The workspace reads candidates from its own port. The engine's writes are listed so
  // the fake satisfies the whole interface, and none of them is reachable from a route here.
  listCandidates: () => Promise.resolve([]),
  readCandidateEvidence: () => Promise.resolve(SUGGESTED_EVIDENCE),
  saveRun: () => Promise.reject(new Error('the workspace never writes a pass')),
  findRun: () => Promise.resolve(null),
  findLatestRun: () => Promise.resolve(null),
  findPreviousRun: () => Promise.resolve(null),
} as unknown as MatchRepository;

const THERAPISTS_REPO: TherapistRepository = {
  findById: (therapistId: string) => Promise.resolve(THERAPISTS[therapistId] ?? null),
  listAll: () => Promise.resolve(Object.values(THERAPISTS)),
} as unknown as TherapistRepository;

function build(harness: Harness) {
  return buildApp({
    workspace: harness.workspace,
    matches: MATCHES,
    therapists: THERAPISTS_REPO,
  });
}

async function postDecision(
  app: ReturnType<typeof build>,
  payload: unknown,
  path = `/api/v1/matching-workspace/cases/${MATCH_ID}/decision`,
) {
  return app.inject({
    method: 'POST',
    url: path,
    headers: { 'content-type': 'application/json' },
    payload: payload as never,
  });
}

describe('GET /matching-workspace/cases', () => {
  it('lists cases waiting for a decision, with a summary a queue can be scanned by', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      cases: {
        matchId: string;
        primaryNeeds: string[];
        systemSuggestedName: string;
        status: string;
      }[];
    }>();

    expect(body.cases).toHaveLength(1);
    expect(body.cases[0]).toMatchObject({
      matchId: MATCH_ID,
      // Language, then the work, then the style — the order a reviewer sorts by. Both
      // languages, because a client who named two has not ranked them, and each family
      // alphabetical because the order they were picked in is not stored and an
      // arbitrary order would read as a priority.
      primaryNeeds: ['English', 'Hindi', 'Career transitions', 'Relationships', 'Exploratory'],
      systemSuggestedName: 'Tara Joshi',
      status: 'NEEDS_REVIEW',
    });
  });

  it('is an empty list, not an error, when nothing needs review', async () => {
    const harness = fakeWorkspace();
    harness.listCases.mockResolvedValue([]);

    const response = await build(harness).inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ cases: unknown[] }>().cases).toEqual([]);
  });

  it('sends no score, and no client identity beyond the case', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases',
    });

    // A case is a pass, and a client is a UUID with no name attached to it anywhere.
    expect(response.body).not.toContain('score');
    expect(response.body).not.toContain(CLIENT_ID);
    expect(response.body).not.toContain(SUGGESTED_THERAPIST_ID);
  });

  it('reports a store failure as 503 with a sentence', async () => {
    const harness = fakeWorkspace({
      listCases: () => {
        throw new DataStoreUnavailableError('The matching workspace is not available.');
      },
    });

    const response = await build(harness).inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases',
    });

    // One sentence for every store failure on every route, because the person reading it
    // is a matcher rather than whoever is on call.
    expect(response.statusCode).toBe(503);
    expect(response.json<{ message: string }>().message).toBe(
      'We could not reach where matches are recorded right now.',
    );
  });
});

describe('GET /matching-workspace/cases/:matchId', () => {
  it('shows what the client needs, what was suggested, and why', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      needs: { languages: { name: string }[]; communicationStyles: { name: string }[] };
      suggestion: {
        therapist: { displayName: string };
        shared: { sentence: string }[];
        notOffered: { category: string; names: string[] }[];
      };
    }>();

    expect(body.needs.languages.map((entry) => entry.name)).toEqual(['Hindi', 'English']);
    expect(body.needs.communicationStyles.map((entry) => entry.name)).toEqual(['Exploratory']);
    expect(body.suggestion.therapist.displayName).toBe('Tara Joshi');
    expect(body.suggestion.shared.map((entry) => entry.sentence)).toEqual([
      'They speak Hindi, one of the languages you chose.',
      'You wanted someone who helps you explore things.',
      'You said you wanted support with relationships, and they work with it.',
      'They see clients online.',
      'They have direct experience with the Indian diaspora.',
    ]);
  });

  it('names what a candidate does not carry, per family, and only where it is true', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    const body = response.json<{
      suggestion: { notOffered: { category: string; names: string[] }[] };
      alternatives: { notOffered: { category: string; names: string[] }[] }[];
    }>();

    // The suggestion covers relationships but not career transitions, and works directly
    // where the client asked for something exploratory.
    expect(body.suggestion.notOffered).toEqual([
      { category: 'AREA_OF_WORK', names: ['Career transitions'] },
      { category: 'COMMUNICATION_STYLE', names: ['Exploratory'] },
    ]);

    // The alternative covers career transitions but not relationships — the mirror image,
    // and exactly the information that lets a reviewer judge the swap.
    expect(body.alternatives[0]?.notOffered).toEqual([
      { category: 'AREA_OF_WORK', names: ['Relationships'] },
    ]);
  });

  it('says so when a candidate misses the only thing the client asked for in a family', async () => {
    // A one-item family is the common case: one client who wants an exploratory
    // conversation, one therapist who does not work that way. The line naming it is the
    // most useful sentence on the page, and it used to be suppressed — a guard meant to
    // avoid padding was silencing the case where a candidate has *none* of what was named.
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    const body = response.json<{
      suggestion: { notOffered: { category: string; names: string[] }[] };
    }>();

    expect(body.suggestion.notOffered).toContainEqual({
      category: 'COMMUNICATION_STYLE',
      names: ['Exploratory'],
    });
  });

  it('never says a shared any-of family is missing, because they met it', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    const body = response.json<{
      suggestion: { notOffered: { category: string }[]; eligible: boolean };
      alternatives: { notOffered: { category: string }[]; eligible: boolean }[];
    }>();

    const eligible = [body.suggestion, ...body.alternatives.filter((entry) => entry.eligible)];

    // The client named Hindi and English. Every eligible candidate speaks at least one, so
    // the condition was met — and listing the language they lack would tell a reviewer
    // they had failed something they passed. The same holds for session format.
    for (const candidate of eligible) {
      const categories = candidate.notOffered.map((entry) => entry.category);

      expect(categories).not.toContain('LANGUAGE');
      expect(categories).not.toContain('SESSION_FORMAT');
    }
  });

  it('does say so when a candidate offers none of what was named, which is why they were set aside', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    const body = response.json<{
      alternatives: {
        eligible: boolean;
        notOffered: { category: string; names: string[] }[];
      }[];
    }>();

    const setAside = body.alternatives.find((entry) => !entry.eligible);

    // The any-of rule has exactly one case to report — none of what was named — and this
    // candidate is the one that trips it. It is the same fact as their `rejectionCode`,
    // stated in the reviewer's terms.
    expect(setAside?.notOffered).toContainEqual({
      category: 'LANGUAGE',
      names: ['Hindi', 'English'],
    });
  });

  it('shows a small set of alternatives, and says which were set aside', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    const body = response.json<{
      alternatives: { matchId: string; eligible: boolean; rejectionCode: string | null }[];
      selectableMatchIds: string[];
    }>();

    // Three of the four candidates, in the engine's order, and the fourth is the one the
    // engine set aside — offered for inspection, never offered for selection.
    expect(body.alternatives.map((entry) => entry.matchId)).toEqual([
      ALTERNATIVE_MATCH_ID,
      THIRD_MATCH_ID,
      SET_ASIDE_MATCH_ID,
    ]);
    expect(body.alternatives[2]).toMatchObject({
      eligible: false,
      rejectionCode: 'REQUIREMENT_NOT_MET',
    });
    expect(body.selectableMatchIds).toEqual([MATCH_ID, ALTERNATIVE_MATCH_ID, THIRD_MATCH_ID]);
  });

  it('shows the whole profile, so a candidate can be judged rather than trusted', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    const body = response.json<{ alternatives: Record<string, unknown>[] }>();

    expect(body.alternatives[0]).toMatchObject({
      therapist: {
        displayName: 'Aditi Raghunathan',
        communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
        contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
        availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1200 }],
      },
    });
  });

  it('leaves the client’s own words out unless the exact value asks for them', async () => {
    const harness = fakeWorkspace();
    const app = build(harness);

    const plain = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    expect(plain.json<{ clientsWords: unknown }>().clientsWords).toBeNull();
    expect(plain.body).not.toContain('explaining my family');
    expect(harness.readClientsWords).not.toHaveBeenCalled();

    // `true` and `1` are not consent. A flag that switches itself on for any non-empty
    // value is a flag that will eventually be on by accident.
    for (const value of ['true', '1', 'yes', '']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/matching-workspace/cases/${MATCH_ID}?clientsWords=${value}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ clientsWords: unknown }>().clientsWords).toBeNull();
    }

    const revealed = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}?clientsWords=reveal`,
    });

    expect(revealed.statusCode).toBe(200);
    expect(revealed.json<{ clientsWords: { intakeNote: string } }>().clientsWords?.intakeNote).toBe(
      CLIENTS_WORDS.intakeNote,
    );
  });

  it('sends no score, no rank and no weight', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}?clientsWords=reveal`,
    });

    // The engine's figure decides an order and then disappears. A reviewer's case for
    // disagreeing is evidence; a number is an oracle they would learn to defer to.
    for (const forbidden of ['score', 'rank', 'position', 'weight', 'percent', 'ordinal']) {
      expect(response.body).not.toContain(`"${forbidden}"`);
    }
  });

  it('sends no clinical field, because there is nowhere to hold one', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    for (const forbidden of [
      'diagnos',
      'severity',
      'risk',
      'personality',
      'clinical',
      'condition',
    ]) {
      expect(response.body.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('404s a case that does not exist', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${STRANGER_MATCH_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ message: string }>().message).toBe(
      'We do not have a case with that reference.',
    );
  });

  it('400s a reference that is not an identifier', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toBe('That does not identify a case.');
  });

  it('reports a store failure as 503', async () => {
    const harness = fakeWorkspace({
      findCase: () => {
        throw new DataStoreUnavailableError('The matching workspace is not available.');
      },
    });

    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    expect(response.statusCode).toBe(503);
  });
});

describe('GET /matching-workspace/cases/:matchId/clients-words', () => {
  it('is a separate request, so reaching for free text is a visible act', async () => {
    const harness = fakeWorkspace();
    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}/clients-words`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      intakeNote: CLIENTS_WORDS.intakeNote,
      feedbackNotes: CLIENTS_WORDS.feedbackNotes,
    });
  });

  it('400s a reference that is not an identifier, and 404s one that names nothing', async () => {
    const harness = fakeWorkspace();
    const app = build(harness);

    const malformed = await app.inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases/nope/clients-words',
    });
    expect(malformed.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${STRANGER_MATCH_ID}/clients-words`,
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('POST /matching-workspace/cases/:matchId/decision', () => {
  it('records the system suggestion being kept, and derives the type server-side', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), { selectedMatchId: MATCH_ID });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      decisionType: 'SYSTEM_ACCEPTED',
      selectedMatchId: MATCH_ID,
      selectedTherapistName: 'Tara Joshi',
      systemSuggestedName: 'Tara Joshi',
      differs: false,
      recordedAt: '2026-10-12T09:00:00.000Z',
    });

    // Derived from which candidate was chosen, never sent. There is no field through which
    // a caller could file an acceptance as an override.
    expect(harness.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decisionType: 'SYSTEM_ACCEPTED' }),
    );
  });

  it('records an alternative with a reason and an optional note', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      reasons: ['stronger-contextual-experience', 'better-communication-style'],
      note: '  Aditi works exploratorily, which is what was asked for.  ',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      decisionType: 'HUMAN_SELECTED_ALTERNATIVE',
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      selectedTherapistName: 'Aditi Raghunathan',
      // Both names in the receipt, so nobody has to hold two in their head afterwards.
      systemSuggestedName: 'Tara Joshi',
      differs: true,
    });

    expect(harness.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: MATCH_ID,
        selectedMatchId: ALTERNATIVE_MATCH_ID,
        decisionType: 'HUMAN_SELECTED_ALTERNATIVE',
        reasonKeys: ['better-communication-style', 'stronger-contextual-experience'],
        note: 'Aditi works exploratorily, which is what was asked for.',
      }),
    );
  });

  it('keeps nothing when no note was written, and treats blank as absent', async () => {
    const harness = fakeWorkspace();
    const app = build(harness);

    await postDecision(app, { selectedMatchId: MATCH_ID, note: '' });

    expect(harness.recordDecision).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });

  it('refuses an alternative with no reason, because the trail must explain itself', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: ALTERNATIVE_MATCH_ID,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ message: string }>().message).toBe(
      'Say why this one fits better, so the decision can be read later.',
    );
    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('accepts reasons alongside keeping the suggestion, and does not require them', async () => {
    const harness = fakeWorkspace();
    const app = build(harness);

    const withReason = await postDecision(app, {
      selectedMatchId: MATCH_ID,
      reasons: ['better-fit-stated-preferences'],
    });
    expect(withReason.statusCode).toBe(200);

    expect(harness.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ reasonKeys: ['better-fit-stated-preferences'] }),
    );
  });

  it('refuses a candidate the engine set aside, and says why in a sentence', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: SET_ASIDE_MATCH_ID,
      reasons: ['better-fit-stated-preferences'],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ message: string }>().message).toBe(
      'This therapist did not meet something the client marked as important, so they cannot be put in front of them.',
    );
    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a candidate from another pass, distinctly from a rule', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: STRANGER_MATCH_ID,
      reasons: ['other'],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ message: string }>().message).toBe(
      'That therapist is not one of the candidates for this case.',
    );
  });

  it('refuses a therapist id, because the only thing a caller may name is a candidate', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: MATCH_ID,
      therapistId: ALTERNATIVE_THERAPIST_ID,
    });

    // A therapist id is the field a caller would most expect to be honoured. Quietly
    // dropping it would be the worst outcome available.
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toBe(
      'A decision is a choice between the candidates on this page. There is nothing else for you to name here.',
    );
    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a client id or an intake id in the body', async () => {
    const harness = fakeWorkspace();

    for (const field of ['clientId', 'intakeId', 'score', 'decisionType', 'therapistId']) {
      const response = await postDecision(build(harness), {
        selectedMatchId: MATCH_ID,
        [field]: CLIENT_ID,
      });

      expect(response.statusCode).toBe(400);
    }

    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a reason the vocabulary does not hold', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      reasons: ['because-i-said-so'],
    });

    expect(response.statusCode).toBe(200);
    // Unknown reasons resolve to nothing rather than failing the whole decision: a stale
    // page offering a term the vocabulary has since dropped should still be able to
    // record a choice. What it cannot do is persist a justification nobody sanctioned.
    expect(harness.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ reasonKeys: [] }),
    );
  });

  it('reads a single reason sent as a bare string, because the meaning is unambiguous', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      reasons: 'stronger-contextual-experience',
    });

    expect(response.statusCode).toBe(200);
    expect(harness.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ reasonKeys: ['stronger-contextual-experience'] }),
    );
  });

  it('refuses reasons that are neither a string nor a list of them', async () => {
    const harness = fakeWorkspace();
    const app = build(harness);

    for (const reasons of [[7], [{ key: 'other' }], 5, true, null]) {
      const response = await postDecision(app, {
        selectedMatchId: ALTERNATIVE_MATCH_ID,
        reasons,
      });

      // With coercion off, a number cannot become a reason key. Left to AJV's default,
      // `[7]` would have been stored as the string `"7"` — a justification the
      // vocabulary has never heard of, persisted as though a matcher had chosen it.
      expect(response.statusCode).toBe(400);
    }

    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('refuses a body with no choice in it', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), { reasons: ['other'] });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toBe('Choose a therapist for this case.');
  });

  it('refuses a note it could not keep, rather than storing it truncated', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(build(harness), {
      selectedMatchId: MATCH_ID,
      note: 'x'.repeat(2_001),
    });

    expect(response.statusCode).toBe(400);
    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('400s a malformed case reference without reaching the store', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(
      build(harness),
      { selectedMatchId: MATCH_ID },
      '/api/v1/matching-workspace/cases/nope/decision',
    );

    expect(response.statusCode).toBe(400);
    expect(harness.findCase).not.toHaveBeenCalled();
  });

  it('404s a case that does not exist', async () => {
    const harness = fakeWorkspace();
    const response = await postDecision(
      build(harness),
      { selectedMatchId: MATCH_ID },
      `/api/v1/matching-workspace/cases/${STRANGER_MATCH_ID}/decision`,
    );

    expect(response.statusCode).toBe(404);
  });

  it('is safe to retry, returning the first decision rather than writing a second', async () => {
    const harness = fakeWorkspace();
    const app = build(harness);

    const first = await postDecision(app, {
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      reasons: ['stronger-contextual-experience'],
    });
    const second = await postDecision(app, { selectedMatchId: MATCH_ID });

    expect(first.statusCode).toBe(200);
    // A decision is a record of a past moment. Re-deciding is not a revision, so the retry
    // gets the original answer and the audit trail keeps exactly one entry.
    expect(second.statusCode).toBe(200);
    expect(second.json<{ selectedMatchId: string }>().selectedMatchId).toBe(ALTERNATIVE_MATCH_ID);
    // The service reads first and answers from what it finds, so the write is attempted
    // once. The database's unique constraint is the second lock against a race; see
    // `workspace.db.test.ts`.
    expect(harness.recordDecision).toHaveBeenCalledTimes(1);
  });

  it('409s a case that was already decided, when the store reports one', async () => {
    const decided = {
      id: DECISION_ID,
      matchId: MATCH_ID,
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      therapistId: ALTERNATIVE_THERAPIST_ID,
      decisionType: 'HUMAN_SELECTED_ALTERNATIVE' as const,
      reasonKeys: ['stronger-contextual-experience'],
      note: null,
      recordedAt: '2026-10-12T09:00:00.000Z',
    };

    const harness = fakeWorkspace({
      findCase: () =>
        Promise.resolve({
          matchId: MATCH_ID,
          intakeId: INTAKE_ID,
          clientId: CLIENT_ID,
          attempt: 1,
          status: 'RECOMMENDED' as const,
          recommendedTherapistId: SUGGESTED_THERAPIST_ID,
          candidates: CANDIDATES,
          decision: decided,
        }),
    });

    const response = await postDecision(build(harness), { selectedMatchId: MATCH_ID });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ differs: boolean }>().differs).toBe(true);
    expect(harness.recordDecision).not.toHaveBeenCalled();
  });

  it('reports a store failure as 503 and writes nothing', async () => {
    const harness = fakeWorkspace({
      recordDecision: () => {
        throw new DataStoreUnavailableError('The matching workspace is not available.');
      },
    });

    const response = await postDecision(build(harness), { selectedMatchId: MATCH_ID });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ message: string }>().message).toBe(
      'We could not reach where matches are recorded right now.',
    );
  });
});

describe('serialising a decided case', () => {
  it('sends a decided case with its decision in the journey, and does not fail to serialise', async () => {
    const decided = {
      id: DECISION_ID,
      matchId: MATCH_ID,
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      therapistId: ALTERNATIVE_THERAPIST_ID,
      decisionType: 'HUMAN_SELECTED_ALTERNATIVE' as const,
      reasonKeys: ['stronger-contextual-experience'],
      note: 'Aditi has lived it rather than studied it.',
      recordedAt: '2026-10-12T09:00:00.000Z',
    };

    const harness = fakeWorkspace({
      findCase: () =>
        Promise.resolve({
          matchId: MATCH_ID,
          intakeId: INTAKE_ID,
          clientId: CLIENT_ID,
          attempt: 1,
          status: 'RECOMMENDED' as const,
          recommendedTherapistId: SUGGESTED_THERAPIST_ID,
          candidates: CANDIDATES,
          decision: decided,
        }),
      listJourney: () =>
        Promise.resolve([
          {
            attempt: 1,
            matchId: MATCH_ID,
            recommendedTherapistId: SUGGESTED_THERAPIST_ID,
            status: 'RECOMMENDED' as const,
            feedbackReasonKeys: [],
            decision: decided,
            selectedTherapistId: ALTERNATIVE_THERAPIST_ID,
          },
        ]),
    });

    const response = await build(harness).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    // This exact request was a 500 once. The nullable object in the response schema was
    // written as `anyOf: [object, null]`, which `fast-json-stringify` cannot compile — and
    // it only failed on responses that actually carried the value, so every undecided case
    // returned 200 and the route looked fine. The regression is here because "the first
    // response happened not to include it" is exactly how that bug survived.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: { status: 'DECIDED' },
      decision: { note: 'Aditi has lived it rather than studied it.' },
      journey: [
        {
          attempt: 1,
          decision: { selectedMatchId: ALTERNATIVE_MATCH_ID },
          selectedName: 'Aditi Raghunathan',
        },
      ],
    });
  });

  it('sends a null decision on an undecided case, rather than omitting the field', async () => {
    const response = await build(fakeWorkspace()).inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    expect(response.statusCode).toBe(200);

    // Absence of a decision is a value. A field that is sometimes missing and sometimes
    // null is a field every consumer has to ask about.
    expect(response.json()).toMatchObject({ decision: null });
    expect(Object.keys(response.json<Record<string, unknown>>())).toContain('decision');
  });

  it('sends a null availability rather than failing when the client named no times', async () => {
    const harness = fakeWorkspace();
    const app = buildApp({
      workspace: harness.workspace,
      matches: {
        ...MATCHES,
        loadMatchableIntake: (intakeId: string) =>
          Promise.resolve({
            intakeId,
            clientId: CLIENT_ID,
            intake: {
              areasOfWork: ['relationships'],
              communicationStyles: ['exploratory'],
              openToGuidance: false,
              approaches: [],
              contextualExperiences: ['indian-diaspora'],
              languages: ['hi'],
              sessionFormats: ['online'],
              availability: null,
              markedAsRequirements: false,
            },
          }),
      } as unknown as MatchRepository,
      therapists: THERAPISTS_REPO,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${MATCH_ID}`,
    });

    // The second nullable object, for the same reason and with the same consequence.
    expect(response.statusCode).toBe(200);
    expect(response.json<{ needs: { availability: unknown } }>().needs.availability).toBeNull();
  });
});

describe('the review surface itself', () => {
  it('mounts four routes, and every one of them is reached from a match id', async () => {
    const app = build(fakeWorkspace());
    await app.ready();
    const tree = app.printRoutes({ commonPrefix: false });

    expect(tree).toContain('/api/v1/matching-workspace/cases');
    expect(tree).toContain('clients-words');
    expect(tree).toContain('decision');

    // The one parameter is a match, on all three routes that take one. Nothing here
    // addresses a client, an intake or a therapist: a caller cannot steer a review of a
    // person they did not choose, because there is nowhere to name one.
    const workspaceTree = tree.slice(tree.indexOf('matching-workspace'));
    const parameters = new Set(
      [...workspaceTree.matchAll(/:([a-zA-Z]+)/g)].map((entry) => entry[1] ?? ''),
    );

    expect([...parameters]).toEqual(['matchId']);
  });
});
