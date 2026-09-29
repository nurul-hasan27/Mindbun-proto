import { describe, expect, it, vi, type MockedFunction } from 'vitest';
import { Writable } from 'node:stream';
import { buildApp } from '../../../app.js';
import {
  AiUnavailableError,
  type AiCaseContext,
  type AiProvider,
  type AiSignal,
} from '../../../ai/aiProvider.js';
import { buildCaseContext } from '../../../ai/caseContext.js';
import type { IntakeRepository } from '../../../data/intake/intakeRepository.js';
import type { IntakeVocabulary } from '../../../data/intake/intakeTypes.js';
import type { CaseDetail } from '../../../data/matching/decisionTypes.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';

/**
 * The AI routes, tested through the app rather than by calling handlers.
 *
 * Two things are being checked here, and they are different jobs:
 *
 * 1. **The contract.** What each endpoint accepts, what it refuses, and what it returns when
 *    the provider fails, times out, or answers with nonsense.
 * 2. **The privacy boundary.** That a person's own words reach no log line, and that no
 *    response body carries anything internal. These are asserted against the *serialised*
 *    output, because a TypeScript type says nothing about what actually went over the wire.
 */

const VOCABULARY: IntakeVocabulary = {
  areasOfWork: [
    { key: 'career-transitions', name: 'Career transitions' },
    { key: 'work-stress', name: 'Work stress' },
  ],
  communicationStyles: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
  ],
  contextualExperience: [
    { key: 'family-expectations', name: 'Family expectations' },
    { key: 'relocation', name: 'Relocation' },
  ],
  languages: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
  ],
  sessionFormats: [
    { key: 'in-person', name: 'In person' },
    { key: 'online', name: 'Online' },
  ],
};

function fakeIntakes(
  overrides: Partial<Record<keyof IntakeRepository, MockedFunction<never>>> = {},
): IntakeRepository {
  return {
    readVocabulary: overrides.readVocabulary ?? vi.fn(() => Promise.resolve(VOCABULARY)),
    submit: vi.fn(() =>
      Promise.resolve({
        intakeId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea',
        receivedAt: '2026-09-28T12:00:00.000Z',
      }),
    ),
  };
}

/**
 * A provider whose every method is a spy, so a test can assert on what was asked.
 *
 * The spies come back as **named values** alongside the provider rather than being reached
 * through the port. `expect(turn).toHaveBeenCalledWith(...)` says which call the test means;
 * `expect(turn)` is a detour through an interface, and it reads as a method reference
 * that could be called with the wrong `this`. This is the same shape the intake route's
 * tests use for their repository.
 */
interface ProviderSpies {
  readonly nextTurn: MockedFunction<AiProvider['nextTurn']>;
  readonly extractSignals: MockedFunction<AiProvider['extractSignals']>;
  readonly summariseCase: MockedFunction<AiProvider['summariseCase']>;
}

interface FakeProvider {
  readonly ai: AiProvider;
  readonly turn: ProviderSpies['nextTurn'];
  readonly extract: ProviderSpies['extractSignals'];
  readonly summarise: ProviderSpies['summariseCase'];
}

const DEFAULT_TURN = { reply: 'Hello.', readyToSummarise: false };
const DEFAULT_SUMMARY = {
  summary: 'They are looking for support around Work stress and Exploratory.',
  observations: ['They speak Hindi.'],
  tradeoffs: [],
} as const;

function fakeProvider(overrides: Partial<AiProvider> = {}): FakeProvider {
  const nextTurn = vi.fn(() => Promise.resolve(DEFAULT_TURN));
  const extractSignals = vi.fn(() => Promise.resolve([]));
  const summariseCase = vi.fn(() => Promise.resolve(DEFAULT_SUMMARY));

  return {
    ai: {
      name: 'test',
      available: true,
      nextTurn,
      extractSignals,
      summariseCase,
      ...overrides,
    },
    turn: nextTurn,
    extract: extractSignals,
    summarise: summariseCase,
  };
}

const TURN = {
  role: 'user',
  text: 'Work has been stressful and I would rather talk things through.',
};

/**
 * The context the provider was given.
 *
 * Throws rather than returning a possibly-undefined value, because every caller asserts
 * something about it and an assertion about `undefined` would pass for the wrong reason.
 */
function firstContext(spy: MockedFunction<AiProvider['summariseCase']>): AiCaseContext {
  const call = spy.mock.calls[0];

  if (call === undefined) {
    throw new Error('The provider was never asked to summarise a case.');
  }

  return call[0];
}

// ---------------------------------------------------------------------------

describe('POST /api/v1/ai/intake/turn', () => {
  it('answers with one turn and names the provider', async () => {
    const { ai } = fakeProvider({
      nextTurn: vi.fn(() =>
        Promise.resolve({ reply: 'What has been going on?', readyToSummarise: false }),
      ),
    });
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [TURN], known: {} },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reply: 'What has been going on?',
      readyToSummarise: false,
      provider: 'test',
    });
  });

  it('passes the transcript and what the intake already holds', async () => {
    const { ai, turn } = fakeProvider();
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: {
        messages: [TURN],
        known: { areasOfWork: ['work-stress'], communicationStyles: ['exploratory'] },
      },
    });

    expect(turn).toHaveBeenCalledWith([TURN], {
      areasOfWork: ['work-stress'],
      communicationStyles: ['exploratory'],
    });
  });

  it('refuses a request for a diagnosis without calling the provider at all', async () => {
    const { ai, turn } = fakeProvider();
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [{ role: 'user', text: 'Do I have anxiety?' }], known: {} },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ provider: string }>().provider).toBe('guard');
    // The control, not a prompt: a model was never involved.
    expect(turn).not.toHaveBeenCalled();
  });

  it('offers the manual intake when the assistant is switched off', async () => {
    const app = buildApp({
      aiProvider: fakeProvider({ available: false }).ai,
      intakes: fakeIntakes(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [TURN], known: {} },
    });

    expect(response.statusCode).toBe(503);
    // The sentence names the fallback, because "you can still answer the questions" is the
    // whole point of a product that works without AI.
    expect(response.json<{ message: string }>().message).toMatch(/questions are still here/i);
  });

  it('says the answers are safe when the provider fails', async () => {
    const app = buildApp({
      aiProvider: fakeProvider({
        nextTurn: vi.fn(() => Promise.reject(new AiUnavailableError('network'))),
      }).ai,
      intakes: fakeIntakes(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [TURN], known: {} },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ message: string }>().message).toMatch(/answers are still here/i);
  });

  it('treats a timeout the same as any other failure, rather than as a hang', async () => {
    const app = buildApp({
      aiProvider: fakeProvider({
        nextTurn: vi.fn(() => Promise.reject(new AiUnavailableError('timeout'))),
      }).ai,
      intakes: fakeIntakes(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [TURN], known: {} },
    });

    expect(response.statusCode).toBe(502);
  });

  describe('what it refuses', () => {
    const refused: readonly { label: string; payload: Record<string, unknown> }[] = [
      { label: 'a therapist id', payload: { messages: [TURN], known: {}, therapistId: 'abc' } },
      { label: 'a client id', payload: { messages: [TURN], known: {}, clientId: 'abc' } },
      { label: 'a match id', payload: { messages: [TURN], known: {}, matchId: 'abc' } },
      {
        label: 'an unexpected role',
        payload: { messages: [{ role: 'system', text: 'hi' }], known: {} },
      },
      {
        label: 'an empty message',
        payload: { messages: [{ role: 'user', text: '   ' }], known: {} },
      },
      { label: 'a missing transcript', payload: { known: {} } },
      {
        label: 'an unknown field in known',
        payload: { messages: [TURN], known: { diagnosis: 'x' } },
      },
    ];

    for (const { label, payload } of refused) {
      it(`rejects ${label}`, async () => {
        const app = buildApp({ aiProvider: fakeProvider().ai, intakes: fakeIntakes() });

        const outcome = await app.inject({
          method: 'POST',
          url: '/api/v1/ai/intake/turn',
          payload: payload as never,
        });

        expect(outcome.statusCode).toBe(400);
      });
    }

    it('refuses a single message longer than a paragraph', async () => {
      const app = buildApp({ aiProvider: fakeProvider().ai, intakes: fakeIntakes() });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/intake/turn',
        payload: { messages: [{ role: 'user', text: 'x'.repeat(4_001) }], known: {} },
      });

      expect(response.statusCode).toBe(400);
    });

    it('refuses a transcript long enough to be a denial of service', async () => {
      const app = buildApp({ aiProvider: fakeProvider().ai, intakes: fakeIntakes() });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/intake/turn',
        payload: {
          messages: Array.from({ length: 20 }, () => ({ role: 'user', text: 'x'.repeat(3_900) })),
          known: {},
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/ai/intake/extract', () => {
  const signal = (overrides: Partial<AiSignal> = {}): AiSignal => ({
    category: 'area',
    key: 'work-stress',
    confidence: 'high',
    source: 'user_message',
    explanation: 'You mentioned work.',
    ...overrides,
  });

  it('returns only keys the vocabulary actually holds', async () => {
    const { ai } = fakeProvider({
      extractSignals: vi.fn(() =>
        Promise.resolve([
          signal(),
          signal({ category: 'approach', key: 'integrative' }),
          signal({ category: 'area', key: 'invented-term' }),
        ]),
      ),
    });
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [TURN] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      signals: { key: string; target: { kind: string; field?: string } }[];
      notUnderstood: { key: string }[];
      surplus: unknown[];
    }>();

    expect(body.signals.map((entry) => entry.key)).toEqual(['work-stress']);
    expect(body.signals[0]?.target).toEqual({
      kind: 'draft',
      field: 'areasOfWork',
      label: 'Work stress',
    });
    // Reported, not swallowed. "integrative" is in the approaches table but has no question
    // on the intake, and `invented-term` is nowhere at all.
    expect(body.notUnderstood.map((entry) => entry.key).sort()).toEqual([
      'integrative',
      'invented-term',
    ]);
    expect(body.surplus).toEqual([]);
  });

  it('survives a provider returning something that is not a list', async () => {
    const app = buildApp({
      aiProvider: fakeProvider({
        extractSignals: vi.fn(() => Promise.resolve('not a list' as never)),
      }).ai,
      intakes: fakeIntakes(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [TURN] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ signals: unknown[] }>().signals).toEqual([]);
  });

  it('survives a provider returning a huge response', async () => {
    const app = buildApp({
      aiProvider: fakeProvider({
        extractSignals: vi.fn(() => Promise.resolve(Array.from({ length: 5_000 }, () => signal()))),
      }).ai,
      intakes: fakeIntakes(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [TURN] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ signals: unknown[] }>().signals.length).toBeLessThanOrEqual(8);
  });

  it('will not summarise a conversation where a request for care was refused', async () => {
    const { ai, extract } = fakeProvider();
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [{ role: 'user', text: 'What medication should I take?' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ signals: unknown[] }>().signals).toEqual([]);
    expect(extract).not.toHaveBeenCalled();
  });

  it('refuses to summarise an empty conversation', async () => {
    const { ai, extract } = fakeProvider();
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [{ role: 'assistant', text: 'Hello.' }] },
    });

    expect(response.statusCode).toBe(400);
    expect(extract).not.toHaveBeenCalled();
  });

  it('reports an unreachable store as 503, and says so without blaming the model', async () => {
    const app = buildApp({
      aiProvider: fakeProvider().ai,
      intakes: fakeIntakes({
        readVocabulary: vi.fn(() => Promise.reject(new DataStoreUnavailableError('down'))) as never,
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [TURN] },
    });

    expect(response.statusCode).toBe(503);
    // A 503 here is our problem, not the assistant's, and the copy should not suggest a retry
    // with a different provider.
    expect(response.json<{ message: string }>().message).toMatch(/could not read the questions/i);
  });

  it('never lets a caller supply vocabulary keys of their own', async () => {
    const { ai, extract } = fakeProvider();
    const app = buildApp({ aiProvider: ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/extract',
      payload: { messages: [TURN], keys: ['work-stress'], signals: [signal()] },
    });

    expect(response.statusCode).toBe(400);
    expect(extract).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

/** A case, as `findCase` returns it. */
function fakeCase(): CaseDetail {
  const therapist = (id: string, displayName: string) =>
    ({
      id,
      displayName,
      headline: '',
      location: '',
      timezone: '',
      yearsOfExperience: 5,
      languages: [],
      areasOfWork: [],
      communicationStyles: [],
      bio: '',
      approaches: [],
      contextualExperience: [],
      sessionFormats: [],
      availability: [],
    }) as never;

  return {
    summary: {
      matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8',
      intakeId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e9',
      attempt: 1,
      primaryNeeds: ['Work stress'],
      systemSuggestedName: 'Ananya Rao',
      status: 'NEEDS_REVIEW',
      hasHistory: false,
    },
    needs: {
      areasOfWork: [{ key: 'work-stress', name: 'Work stress' }],
      communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
      approaches: [],
      contextualExperiences: [],
      languages: [{ key: 'hi', name: 'Hindi' }],
      sessionFormats: [],
      availability: null,
      openToGuidance: false,
      markedAsRequirements: true,
    },
    suggestion: {
      matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8',
      therapist: therapist('t1', 'Ananya Rao'),
      shared: [{ key: 'LANGUAGE', sentence: 'They speak Hindi, one of the languages you chose.' }],
      // The stored code, not the display label. `buildCaseContext` translates it, and a
      // fixture that arrived pre-translated would hide the fact that it ever needed to.
      notOffered: [{ category: 'COMMUNICATION_STYLE', names: ['Exploratory'] }],
    },
    alternatives: [],
    selectableMatchIds: ['0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8'],
    decisionReasons: [],
    journey: [],
    decision: null,
    clientsWords: null,
  };
}

const CASE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8';

describe('GET /api/v1/matching-workspace/cases/:matchId/ai-summary', () => {
  function workspaceApp(ai: AiProvider) {
    // `findCase` returns a stored row, not the read model. It is the service that turns one
    // into the other, so the fake has to answer the question the service asks: a match row
    // with its candidates and their evidence.
    const detail = fakeCase();
    const row = {
      matchId: CASE_ID,
      intakeId: detail.summary.intakeId,
      clientId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb',
      attempt: 1,
      status: 'RECOMMENDED',
      recommendedTherapistId: 't1',
      candidates: [
        {
          matchId: CASE_ID,
          therapistId: 't1',
          eligible: true,
          rejectionCode: null,
          // The stored evidence row. `explainAll` turns it into the sentence a matcher reads,
          // so the sentence asserted below is *derived* here rather than declared — which is
          // the point: the AI is handed exactly what the client was shown.
          evidence: [
            {
              category: 'LANGUAGE',
              explanation: 'REQUIRED_LANGUAGE',
              clientKey: 'hi',
              therapistKey: 'hi',
            },
          ],
        },
      ],
      decision: null,
    };

    const workspace = {
      findCase: vi.fn(() => Promise.resolve(row)),
      readClientsWords: vi.fn(() =>
        Promise.resolve({ intakeNote: 'secret words', feedbackNotes: [] }),
      ),
      listJourney: vi.fn(() => Promise.resolve([])),
      listCases: vi.fn(() => Promise.resolve([])),
      readDecisionReasons: vi.fn(() => Promise.resolve([])),
      findDecisions: vi.fn(() => Promise.resolve(new Map())),
      recordDecision: vi.fn(),
    };
    // `loadMatchableIntake` is keyed by id but `findCase` looks the case up by its own
    // intake id, so both are answered from the same stored shape the engine reads.
    const intakeId = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e9';
    const matches = {
      readVocabularyNames: vi.fn(() =>
        Promise.resolve(
          new Map([
            ['hi', 'Hindi'],
            ['work-stress', 'Work stress'],
            ['exploratory', 'Exploratory'],
          ]),
        ),
      ),
      loadMatchableIntake: vi.fn(() =>
        Promise.resolve({
          intake: {
            areasOfWork: ['work-stress'],
            communicationStyles: ['exploratory'],
            openToGuidance: false,
            approaches: [],
            contextualExperiences: [],
            languages: ['hi'],
            sessionFormats: [],
            availability: null,
            markedAsRequirements: true,
          },
        }),
      ),
    } as never;

    const therapists = {
      findById: vi.fn(() => Promise.resolve(detail.suggestion.therapist)),
    } as never;

    expect(intakeId).toBe(detail.summary.intakeId);

    return {
      app: buildApp({
        logger: false,
        aiProvider: ai,
        workspace: workspace as never,
        matches,
        therapists,
      }),
      workspace,
      detail,
    };
  }

  it('sends the provider structured data and nothing else', async () => {
    const { ai, summarise } = fakeProvider();
    const { app } = workspaceApp(ai);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ provider: string }>().provider).toBe('test');

    const context = firstContext(summarise);

    expect(context.needs.map((need) => need.label)).toEqual(
      expect.arrayContaining(['Work stress', 'Exploratory', 'Hindi']),
    );
    // Read from the engine's own explanation, so if that sentence ever changes this test
    // changes with it rather than asserting a stale copy.
    expect(context.suggestion.reasons).toHaveLength(1);
    expect(context.suggestion.reasons[0]).toMatch(/Hindi/);
    expect(context.priorFeedback).toEqual([]);
  });

  it('never loads the client’s own words to build a summary', async () => {
    const { ai } = fakeProvider();
    const { app, workspace } = workspaceApp(ai);

    await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    // The separate, opt-in method from Phase 7 was not called. The AI summary cannot be a
    // way around the boundary that method exists to enforce.
    expect(workspace.readClientsWords).not.toHaveBeenCalled();
  });

  it('leaves the case out of the provider input entirely', async () => {
    const { ai, summarise } = fakeProvider();
    const { app } = workspaceApp(ai);

    await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    const context = JSON.stringify(firstContext(summarise));

    // Serialised, so a field added later and missed by a type-level check would still show.
    expect(context).not.toContain('secret words');
    expect(context).not.toMatch(/score|rank|percentage/i);
    expect(context).not.toMatch(/intakeNote|feedbackNote|biography|rawText/);
  });

  it('refuses a summary that claims something the case does not contain', async () => {
    const { ai } = fakeProvider({
      summariseCase: vi.fn(() =>
        Promise.resolve({
          summary: 'Priya Sharma is the best match for this client.',
          observations: ['They speak Hindi.'],
          tradeoffs: [],
        }),
      ),
    });
    const { app } = workspaceApp(ai);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    expect(response.statusCode).toBe(502);
    // The sentence a matcher reads, and it says the evidence is untouched.
    expect(response.json<{ message: string }>().message).toMatch(/evidence is unchanged/i);
  });

  it('never returns a refused summary, even partially', async () => {
    const { ai } = fakeProvider({
      summariseCase: vi.fn(() =>
        Promise.resolve({
          summary: 'Ananya Rao speaks Hindi.',
          observations: ['Ananya Rao scores 96% on this intake.'],
          tradeoffs: [],
        }),
      ),
    });
    const { app } = workspaceApp(ai);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    // All or nothing. A summary that is half-checked is exactly the one nobody can trust.
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toMatch(/Ananya Rao speaks Hindi/);
    expect(response.body).not.toMatch(/96/);
  });

  it('reports a provider failure without an excuse', async () => {
    const { ai } = fakeProvider({
      summariseCase: vi.fn(() => Promise.reject(new AiUnavailableError('timeout'))),
    });
    const { app } = workspaceApp(ai);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ message: string }>().message).toMatch(/evidence is unchanged/i);
  });

  it('rejects a reference that is not a case', async () => {
    const { ai, summarise } = fakeProvider();
    const { app } = workspaceApp(ai);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/matching-workspace/cases/not-a-uuid/ai-summary',
    });

    expect(response.statusCode).toBe(400);
    expect(summarise).not.toHaveBeenCalled();
  });

  it('answers 404 for a case that does not exist', async () => {
    const { ai } = fakeProvider();
    const app = buildApp({
      aiProvider: ai,
      workspace: {
        findCase: vi.fn(() => Promise.resolve(null)),
        readClientsWords: vi.fn(),
        listJourney: vi.fn(),
      } as never,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('offers the evidence alone when the assistant is switched off', async () => {
    const { ai } = fakeProvider({ available: false });
    const { app } = workspaceApp(ai);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ message: string }>().message).toMatch(/evidence below is unchanged/i);
  });

  it('ignores a body, because there is no schema for one to satisfy', async () => {
    const { ai, summarise } = fakeProvider();
    const { app } = workspaceApp(ai);

    // Fastify does not parse a body for a route that declares none, so this cannot steer
    // anything. Asserted because "it was ignored" is a weaker and more easily-broken
    // guarantee than "it was refused", and it is the one that actually holds.
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/matching-workspace/cases/${CASE_ID}/ai-summary`,
      payload: { therapistId: 'someone-else' },
    });

    expect(response.statusCode).toBe(200);
    expect(summarise).toHaveBeenCalledOnce();
    // The only thing that reached the provider came from the path parameter and the store.
    expect(JSON.stringify(firstContext(summarise))).not.toContain('someone-else');
  });
});

// ---------------------------------------------------------------------------

describe('privacy', () => {
  /** A log sink, so a test can read what the process would have written. */
  function captureLogs(): { stream: Writable; text: () => string } {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk.toString());
        done();
      },
    });

    return { stream, text: () => chunks.join('') };
  }

  const WORDS = 'I moved to Germany and my parents keep asking when I am going to settle down.';

  it('puts nothing from the transcript into a log line', async () => {
    const logs = captureLogs();
    const app = buildApp({
      // A failure, because that is the path that logs something.
      aiProvider: fakeProvider({
        nextTurn: vi.fn(() => Promise.reject(new AiUnavailableError('network'))),
      }).ai,
      intakes: fakeIntakes(),
      logger: { level: 'warn', stream: logs.stream },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [{ role: 'user', text: WORDS }], known: {} },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(logs.text()).not.toContain(WORDS);
    expect(logs.text()).not.toContain('Germany');
    expect(logs.text()).not.toContain('settle down');
  });

  it('does not put a rejected body into a log line either', async () => {
    const logs = captureLogs();
    const app = buildApp({
      aiProvider: fakeProvider().ai,
      intakes: fakeIntakes(),
      logger: { level: 'warn', stream: logs.stream },
    });

    // An unexpected field, which `removeAdditional: false` turns into a validation failure.
    await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [{ role: 'user', text: WORDS }], known: {}, therapistId: 'x' },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    // The field *name* may appear — that is what a 400 is for. The words may not.
    expect(logs.text()).not.toContain(WORDS);
    expect(logs.text()).not.toContain('Germany');
  });

  it('never returns free text in an error body', async () => {
    const app = buildApp({
      aiProvider: fakeProvider({
        nextTurn: vi.fn(() => Promise.reject(new AiUnavailableError('network'))),
      }).ai,
      intakes: fakeIntakes(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [{ role: 'user', text: WORDS }], known: {} },
    });

    expect(response.body).not.toContain('Germany');
    expect(response.body).not.toContain(WORDS);
  });

  it('keeps the assistant off every client-facing schema', async () => {
    const app = buildApp({ aiProvider: fakeProvider().ai, intakes: fakeIntakes() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/intake/turn',
      payload: { messages: [TURN], known: {} },
    });

    const body = response.json<Record<string, unknown>>();

    // No field a case, a decision or a score could travel in. Read from the serialised body
    // rather than the type, because only the body is what a browser receives.
    expect(Object.keys(body).sort()).toEqual(['provider', 'readyToSummarise', 'reply']);
  });
});

describe('buildCaseContext', () => {
  it('carries what the client said in their own words, never their own sentence', () => {
    const detail = fakeCase();
    const withJourney = {
      ...detail,
      journey: [
        {
          attempt: 1,
          matchId: CASE_ID,
          systemSuggestedName: 'Someone Else',
          clientFeedback: ['communication-mismatch'],
          clientFeedbackNames: ['The communication style didn’t feel right.'],
          decision: null,
          selectedName: null,
          status: 'DECLINED',
        },
      ],
    } as unknown as CaseDetail;

    const context = buildCaseContext(withJourney);

    expect(context.priorFeedback).toEqual(['The communication style didn’t feel right.']);

    // And nothing that could be a sentence they typed. The free text lives behind
    // `readClientsWords`, a separate opt-in, and this path never asks for it.
    expect(JSON.stringify(context)).not.toMatch(/feedbackNotes|intakeNote|rawText/);
  });

  it('says what the case says, rather than the key it is stored under', () => {
    // The control for the test above, and the bug this replaced: the feedback keys were
    // looked up in the *decision* vocabulary, which is a different table, so nothing matched
    // and the bare key — `communication-mismatch` — reached the summary as prose. The
    // grounding check then refused the whole summary for a reason no reader could act on.
    const detail = fakeCase();
    const withJourney = {
      ...detail,
      journey: [
        {
          attempt: 1,
          matchId: CASE_ID,
          systemSuggestedName: 'Someone Else',
          clientFeedback: ['communication-mismatch'],
          clientFeedbackNames: ['The communication style didn’t feel right.'],
          decision: null,
          selectedName: null,
          status: 'DECLINED',
        },
      ],
      // The decision vocabulary, which does not contain the feedback key — exactly as in
      // production, where the two are separate tables.
      decisionReasons: [
        { key: 'better-communication-style', name: 'Better communication style', description: '' },
      ],
    } as unknown as CaseDetail;

    expect(JSON.stringify(buildCaseContext(withJourney))).not.toContain('communication-mismatch');
  });

  it('offers only the alternatives a matcher may actually choose', () => {
    const detail = fakeCase();
    const withIneligible = {
      ...detail,
      alternatives: [
        {
          matchId: 'a',
          therapist: detail.suggestion.therapist,
          eligible: true,
          rejectionCode: null,
          shared: [],
          notOffered: [],
        },
        {
          matchId: 'b',
          therapist: detail.suggestion.therapist,
          eligible: false,
          rejectionCode: 'NO_SHARED_LANGUAGE',
          shared: [],
          notOffered: [],
        },
      ],
    } as unknown as CaseDetail;

    const context = buildCaseContext(withIneligible);

    // Offering a tradeoff against someone the server will refuse is offering a decision that
    // does not exist.
    expect(context.alternatives).toHaveLength(1);
  });

  it('translates a stored family code into words, because a summary is prose', () => {
    const detail = fakeCase();
    const withGap = {
      ...detail,
      suggestion: {
        ...detail.suggestion,
        notOffered: [{ category: 'AREA_OF_WORK', names: ['Work stress'] }],
      },
    } as unknown as CaseDetail;

    const context = buildCaseContext(withGap);
    const category = context.suggestion.notOffered[0]?.category ?? '';

    // `AREA_OF_WORK` in a sentence is a bug report, and it tokenises to something no prose
    // contains, so a summary quoting it verbatim would be refused for a reason nobody could
    // act on. The workspace resolves the same codes the same way.
    expect(category).not.toBe('AREA_OF_WORK');
    expect(category).toMatch(/[a-z]/);
    expect(category).toBe('Work with');
  });

  it('leaves an unrecognised family as it found it rather than guessing at a label', () => {
    const detail = fakeCase();
    const withGap = {
      ...detail,
      suggestion: {
        ...detail.suggestion,
        notOffered: [{ category: 'SOMETHING_NEW', names: ['A thing'] }],
      },
    } as unknown as CaseDetail;

    // Guessing would be worse than passing it through: a wrong label in a summary reads as
    // fact, and the code at least says plainly that it was not recognised.
    expect(buildCaseContext(withGap).suggestion.notOffered[0]?.category).toBe('SOMETHING_NEW');
  });

  it('repeats no field that could carry a client’s words', () => {
    const context = buildCaseContext(fakeCase());
    const serialised = JSON.stringify(context);

    expect(serialised).not.toMatch(/note|word|intakeId|clientId|rawText|score|rank/);
  });
});
