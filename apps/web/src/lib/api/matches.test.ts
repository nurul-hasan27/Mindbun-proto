import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { requestMatch, requestRecommendation } from './matches';
import { neverSettles, stubFetch, type StubHandler } from '../../test/stubFetch';
import { API_V1 } from './version';
import type { MatchRecommendation, NoCandidateOutcome } from './types';

const BASE_URL = 'http://api.test:4000';
const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';

const RECOMMENDATION: MatchRecommendation = {
  matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec',
  decidedAt: '2026-09-30T09:00:00.000Z',
  // A first match: one pass, nobody to have come away from, nothing adjusted and
  // nothing changed. Present as empty values rather than missing, so a test that
  // forgets one of them fails to compile instead of quietly rendering a wrong page.
  attempt: 1,
  previousTherapistName: null,
  whatChanged: [],
  adjustedFor: [],
  therapist: {
    id: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed',
    displayName: 'Ananya Mehra',
    headline: 'Warm',
    bio: 'A biography.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 8,
    languages: [],
    areasOfWork: [],
    communicationStyles: [],
    approaches: [],
    contextualExperience: [],
    sessionFormats: [],
    availability: [],
  },
  whyThisMatch: [{ key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi.', detail: 'Hindi' }],
};

const NOTHING_QUALIFIED: NoCandidateOutcome = { outcome: 'no_candidate', considered: 50 };

/** The body a call actually sent, parsed. The client serialises with JSON.stringify. */
function sentBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') {
    throw new Error('expected a serialised body');
  }

  return JSON.parse(body) as Record<string, unknown>;
}

function clientReturning(handler: StubHandler) {
  const { fetchImpl, calls } = stubFetch(handler);
  return { client: createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl }), calls };
}

describe('requestMatch', () => {
  it('posts the intake reference to the versioned endpoint', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECOMMENDATION }));

    await requestMatch(INTAKE_ID, client);

    expect(calls[0]?.url).toBe(`${BASE_URL}${API_V1}/matches`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(sentBody(calls[0]?.init.body)).toEqual({ intakeId: INTAKE_ID });
  });

  it('sends nothing but the reference, so a caller cannot ask for a therapist', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECOMMENDATION }));

    await requestMatch(INTAKE_ID, client);

    expect(Object.keys(sentBody(calls[0]?.init.body))).toEqual(['intakeId']);
  });

  it('returns a recommendation', async () => {
    const { client } = clientReturning(() => ({ json: RECOMMENDATION }));

    const outcome = await requestMatch(INTAKE_ID, client);

    expect(outcome).toEqual(RECOMMENDATION);
  });

  it('returns "no candidate" as an outcome, not as an error', async () => {
    // Nobody qualifying is an answer to the question that was asked. A 404 would
    // invite a page to say "not found" instead of explaining the conditions.
    const { client } = clientReturning(() => ({ json: NOTHING_QUALIFIED }));

    const outcome = await requestMatch(INTAKE_ID, client);

    expect(outcome).toEqual(NOTHING_QUALIFIED);
  });

  it('refuses a response it cannot read, rather than rendering nonsense', async () => {
    const { client } = clientReturning(() => ({ json: { matchId: 'x' } }));

    await expect(requestMatch(INTAKE_ID, client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('refuses a recommendation whose therapist is not a therapist', async () => {
    const { client } = clientReturning(() => ({
      json: { ...RECOMMENDATION, therapist: { displayName: 42 } },
    }));

    await expect(requestMatch(INTAKE_ID, client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('refuses a reason that is not a reason', async () => {
    const { client } = clientReturning(() => ({
      json: { ...RECOMMENDATION, whyThisMatch: [{ key: 'X' }] },
    }));

    await expect(requestMatch(INTAKE_ID, client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('reports a rejected request as a typed error carrying the status', async () => {
    const { client } = clientReturning(() => ({
      status: 400,
      statusText: 'Bad Request',
      json: { statusCode: 400, error: 'Bad Request', message: 'That does not identify an intake.' },
    }));

    await expect(requestMatch(INTAKE_ID, client)).rejects.toMatchObject({
      kind: 'http',
      status: 400,
    });
  });

  it('reports an intake it has never seen as a typed 404', async () => {
    const { client } = clientReturning(() => ({
      status: 404,
      statusText: 'Not Found',
      json: { statusCode: 404, error: 'Not Found', message: 'No intake with that reference.' },
    }));

    await expect(requestMatch(INTAKE_ID, client)).rejects.toMatchObject({
      kind: 'http',
      status: 404,
    });
  });

  it('gives up on a service that never answers, so nobody waits forever', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 10, fetchImpl });

    await expect(requestMatch(INTAKE_ID, client)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('can be cancelled, which is how leaving the page stops a search', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 5_000, fetchImpl });
    const controller = new AbortController();

    const pending = requestMatch(INTAKE_ID, client, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('is safe to call twice, because the server evaluates an intake once', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECOMMENDATION }));

    const first = await requestMatch(INTAKE_ID, client);
    const second = await requestMatch(INTAKE_ID, client);

    expect(calls).toHaveLength(2);
    // The same reference both times, which is what makes the server's
    // evaluate-once rule the thing that prevents a duplicate.
    expect(sentBody(calls[0]?.init.body)).toEqual(sentBody(calls[1]?.init.body));
    expect(second).toEqual(first);
  });
});

describe('requestRecommendation', () => {
  it('unwraps the recommendation', async () => {
    const { client } = clientReturning(() => ({ json: RECOMMENDATION }));

    expect(await requestRecommendation(INTAKE_ID, client)).toEqual(RECOMMENDATION);
  });

  it('answers null when nobody qualified', async () => {
    const { client } = clientReturning(() => ({ json: NOTHING_QUALIFIED }));

    expect(await requestRecommendation(INTAKE_ID, client)).toBeNull();
  });
});
