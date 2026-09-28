import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import {
  fetchCase,
  fetchCases,
  fetchClientsWords,
  submitDecision,
  type CaseDetail,
} from './workspace';
import { createApiClient } from './client';
import { API_V1 } from './version';

/**
 * The workspace's HTTP client.
 *
 * Two things are worth testing here, and neither is "does it send the right verb".
 *
 * **What the request body can contain.** The security model of this surface is that a
 * browser has nowhere to put a client id, an intake id or a therapist id. That is a claim
 * about a function's output, and a function's output is exactly what a test can pin.
 *
 * **What happens when the server sends something else.** Two halves of a prototype
 * deployed independently should not produce a page that renders `undefined` in the middle of
 * a sentence for a person trying to do a job. Every reader here refuses a shape it does not
 * recognise rather than passing it on.
 */

const ORIGIN = 'https://example.test';
const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const ALTERNATIVE_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb';
const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ee';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ef';

const CASE = {
  summary: {
    matchId: MATCH_ID,
    intakeId: INTAKE_ID,
    attempt: 1,
    primaryNeeds: ['Hindi', 'Relationships'],
    systemSuggestedName: 'Tara Joshi',
    status: 'NEEDS_REVIEW',
    hasHistory: false,
  },
  needs: {
    areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
    communicationStyles: [],
    approaches: [],
    contextualExperiences: [],
    languages: [{ key: 'hi', name: 'Hindi' }],
    sessionFormats: [{ key: 'online', name: 'Online' }],
    availability: null,
    openToGuidance: false,
    markedAsRequirements: false,
  },
  suggestion: {
    matchId: MATCH_ID,
    therapist: {
      id: THERAPIST_ID,
      displayName: 'Tara Joshi',
      headline: 'Direct, structured',
      bio: 'A biography.',
      location: 'Bengaluru, India',
      timezone: 'Asia/Kolkata',
      yearsOfExperience: 9,
      languages: [{ key: 'hi', name: 'Hindi' }],
      areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
      communicationStyles: [{ key: 'direct', name: 'Direct' }],
      approaches: [],
      contextualExperience: [],
      sessionFormats: [{ key: 'online', name: 'Online' }],
      availability: [],
    },
    eligible: true,
    rejectionCode: null,
    shared: [{ key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi.' }],
    notOffered: [],
  },
  alternatives: [],
  selectableMatchIds: [MATCH_ID],
  decisionReasons: [{ key: 'other', name: 'Something else', description: 'In your words.' }],
  journey: [],
  decision: null,
  clientsWords: null,
} as unknown as CaseDetail;

interface Stub {
  readonly body: unknown;
  readonly status?: number;
}

function clientReturning(stub: Stub) {
  const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(stub.body), {
        status: stub.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

  vi.stubGlobal('fetch', fetchSpy);

  return {
    fetchSpy,
    client: createApiClient({ baseUrl: ORIGIN, timeoutMs: 5_000 }),
  };
}

/** The JSON body of the first request, or `null` when nothing was sent. */
function sentBody(fetchSpy: ReturnType<typeof vi.fn>): unknown {
  const call = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
  const raw = call?.[1]?.body;

  return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
}

describe('the queue', () => {
  it('asks for the cases, and nothing else', async () => {
    const { fetchSpy, client } = clientReturning({
      body: {
        cases: [
          {
            matchId: MATCH_ID,
            intakeId: INTAKE_ID,
            attempt: 1,
            primaryNeeds: ['Hindi'],
            systemSuggestedName: 'Tara Joshi',
            status: 'NEEDS_REVIEW',
            hasHistory: false,
          },
        ],
      },
    });

    const cases = await fetchCases(client);

    expect(cases).toHaveLength(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${ORIGIN}${API_V1}/matching-workspace/cases`);
  });

  it('refuses a list that is not a list of cases', async () => {
    const { client } = clientReturning({ body: { cases: [{ matchId: 7 }] } });

    await expect(fetchCases(client)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('one case', () => {
  it('asks for the case by its match, and sends no identifier of its own', async () => {
    const { fetchSpy, client } = clientReturning({ body: CASE });

    await fetchCase(MATCH_ID, {}, client);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${ORIGIN}${API_V1}/matching-workspace/cases/${MATCH_ID}`,
    );
  });

  it('does not ask for the client’s words unless told to', async () => {
    const { fetchSpy, client } = clientReturning({ body: CASE });

    await fetchCase(MATCH_ID, {}, client);
    expect(fetchSpy.mock.calls[0]?.[0]).not.toContain('clientsWords');

    fetchSpy.mockClear();
    await fetchCase(MATCH_ID, { reveal: true }, client);

    // The exact word the server accepts, so an opt-in that is on is on deliberately.
    expect(fetchSpy.mock.calls[0]?.[0]).toContain('clientsWords=reveal');
  });

  it('refuses a case that is not shaped like one', async () => {
    const { client } = clientReturning({ body: { ...CASE, suggestion: undefined } });

    await expect(fetchCase(MATCH_ID, {}, client)).rejects.toBeInstanceOf(ApiError);
  });

  it('fetches the client’s words from their own endpoint', async () => {
    const { fetchSpy, client } = clientReturning({
      body: { intakeNote: 'A note.', feedbackNotes: [] },
    });

    const words = await fetchClientsWords(MATCH_ID, client);

    expect(words.intakeNote).toBe('A note.');
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${ORIGIN}${API_V1}/matching-workspace/cases/${MATCH_ID}/clients-words`,
    );
  });
});

describe('a decision', () => {
  const receipt = {
    decisionType: 'HUMAN_SELECTED_ALTERNATIVE',
    selectedMatchId: ALTERNATIVE_MATCH_ID,
    selectedTherapistName: 'Aditi Raghunathan',
    systemSuggestedName: 'Tara Joshi',
    differs: true,
    recordedAt: '2026-10-12T09:00:00.000Z',
  };

  it('names a candidate and nothing else that could steer it', async () => {
    const { fetchSpy, client } = clientReturning({ body: receipt });

    await submitDecision(
      MATCH_ID,
      {
        selectedMatchId: ALTERNATIVE_MATCH_ID,
        reasons: ['stronger-contextual-experience'],
        note: 'Aditi has lived it.',
      },
      client,
    );

    // The whole of the internal security model, in one object: a candidate row from the set
    // the case offered. No client id, no intake id, no therapist id, and no `decisionType` —
    // the server derives that from which candidate was named, so a request cannot claim an
    // acceptance was an override or the reverse.
    expect(sentBody(fetchSpy)).toEqual({
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      reasons: ['stronger-contextual-experience'],
      note: 'Aditi has lived it.',
    });
  });

  it('omits the optional fields rather than sending them empty', async () => {
    const { fetchSpy, client } = clientReturning({ body: receipt });

    await submitDecision(MATCH_ID, { selectedMatchId: MATCH_ID }, client);

    // `reasons: []` and `note: ''` would both be claims — that the matcher chose no reasons
    // and wrote nothing — rather than the absence of an opinion.
    expect(sentBody(fetchSpy)).toEqual({ selectedMatchId: MATCH_ID });
  });

  it('posts to the case, so the server derives the client from it', async () => {
    const { fetchSpy, client } = clientReturning({ body: receipt });

    await submitDecision(MATCH_ID, { selectedMatchId: MATCH_ID }, client);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${ORIGIN}${API_V1}/matching-workspace/cases/${MATCH_ID}/decision`,
    );
    expect((fetchSpy.mock.calls[0] as [string, RequestInit])[1].method).toBe('POST');
  });

  it('refuses a receipt it does not recognise', async () => {
    const { client } = clientReturning({ body: { ...receipt, differs: 'yes' } });

    await expect(
      submitDecision(MATCH_ID, { selectedMatchId: MATCH_ID }, client),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
