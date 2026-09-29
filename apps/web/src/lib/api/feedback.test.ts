import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import {
  fetchFeedbackReasons,
  requestRematch,
  requestRematchRecommendation,
  submitFeedback,
} from './feedback';
import { stubFetch, type StubHandler } from '../../test/stubFetch';
import { API_V1 } from './version';
import { isRematch, type RematchRecommendation } from './types';

/**
 * The two requests this phase adds.
 *
 * Two things are being checked that no amount of server-side care can check on its own:
 * that the browser sends nothing it has no business sending, and that it treats a
 * missing field as a reason to refuse rather than as a reason to guess.
 */

const BASE_URL = 'http://api.test:4000';
const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';

const RECOMMENDATION: RematchRecommendation = {
  matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb',
  decidedAt: '2026-10-05T12:05:00.000Z',
  attempt: 2,
  previousTherapistName: 'Ananya Mehra',
  therapist: {
    id: THERAPIST_ID,
    displayName: 'Aditi Raghunathan',
    headline: 'Warm',
    bio: 'A biography.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 9,
    languages: [],
    areasOfWork: [],
    communicationStyles: [],
    approaches: [],
    contextualExperience: [],
    sessionFormats: [],
    availability: [],
  },
  whyThisMatch: [{ key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi.', detail: 'Hindi' }],
  whatChanged: [],
  adjustedFor: ['communication-mismatch'],
};

const RECEIPT = {
  feedbackId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f0',
  matchId: MATCH_ID,
  reasons: [],
  recordedAt: 'now',
};

const NOTHING_LEFT = { outcome: 'no_candidate', considered: 0 };

function built(handler: StubHandler) {
  const { fetchImpl, calls } = stubFetch(handler);

  return {
    client: createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl }),
    calls,
  };
}

function json(body: unknown, status = 200): StubHandler {
  return () => ({ json: body, status });
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
}

describe('GET /feedback/reasons', () => {
  it('reads the wording from the server rather than carrying its own', async () => {
    const { client, calls } = built(
      json({
        reasons: [
          {
            key: 'communication-mismatch',
            name: 'Whatever we decide to call it.',
            description: 'x',
          },
        ],
      }),
    );

    const reasons = await fetchFeedbackReasons(client);

    expect(calls[0]?.url).toBe(`${BASE_URL}${API_V1}/feedback/reasons`);
    // The whole point of fetching: a copywriter can rewrite the sentence without a code
    // change, and the client cannot drift from the vocabulary the server holds.
    expect(reasons[0]?.name).toBe('Whatever we decide to call it.');
  });

  it('refuses a shape it does not understand rather than rendering undefined', async () => {
    const { client } = built(json({ reasons: [{ key: 42 }] }));

    await expect(fetchFeedbackReasons(client)).rejects.toThrow(/expected shape/i);
  });

  it('refuses a response that is not a list at all', async () => {
    const { client } = built(json({ reasons: 'not a list' }));

    await expect(fetchFeedbackReasons(client)).rejects.toThrow(/expected shape/i);
  });
});

describe('POST /matches/:matchId/feedback', () => {
  it('sends the reasons, and nothing else', async () => {
    const { client, calls } = built(json(RECEIPT, 201));

    await submitFeedback(MATCH_ID, { reasons: ['communication-mismatch'] }, client);

    expect(calls[0]?.url).toBe(`${BASE_URL}${API_V1}/matches/${MATCH_ID}/feedback`);
    expect(bodyOf(calls[0]?.init)).toEqual({ reasons: ['communication-mismatch'] });
  });

  it('sends the note only when there is one', async () => {
    const { client, calls } = built(json(RECEIPT, 201));

    await submitFeedback(MATCH_ID, { reasons: ['other'], rawText: 'Something.' }, client);

    // An empty note would be stored as a note made of nothing, and a `null` would be a
    // field the server has to guess the meaning of.
    expect(bodyOf(calls[0]?.init)).toEqual({ reasons: ['other'], rawText: 'Something.' });
  });

  it('encodes the match id, so a strange one cannot escape the path', async () => {
    const { client, calls } = built(json(RECEIPT, 201));

    await submitFeedback('../../admin', { reasons: ['other'] }, client);

    expect(calls[0]?.url).not.toContain('/admin');
  });

  it('sends keys, never the labels a person read', async () => {
    const { client, calls } = built(json(RECEIPT, 201));

    await submitFeedback(MATCH_ID, { reasons: ['communication-mismatch'] }, client);

    // A label in a request body is a UI string that has become a contract.
    expect(calls[0]?.init.body).not.toMatch(/feel right|didn|comfortable|understood/i);
  });

  it('never sends a field the server would refuse', async () => {
    const { client, calls } = built(json(RECEIPT, 201));

    await submitFeedback(MATCH_ID, { reasons: ['other'] }, client);

    // There is no parameter through which a client, a therapist, an exclusion or a
    // weight could be named, so the browser has nowhere to put one.
    expect(Object.keys(bodyOf(calls[0]?.init)).sort()).toEqual(['reasons']);
  });

  it('refuses a receipt that is not shaped like one', async () => {
    const { client } = built(json({ ok: true }, 201));

    await expect(submitFeedback(MATCH_ID, { reasons: ['other'] }, client)).rejects.toThrow(
      /expected shape/i,
    );
  });
});

describe('POST /matches/:matchId/rematch', () => {
  it('sends no body and no content-type, because there is nothing to send', async () => {
    const { client, calls } = built(json(RECOMMENDATION));

    await requestRematch(MATCH_ID, client);

    // There is no field here for naming a client, a therapist, an exclusion or a weight.
    // A `content-type` with no body is a malformed request by anyone's reading, so the
    // header is left off as well as the body.
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBeUndefined();
    expect(
      (calls[0]?.init.headers as Record<string, string> | undefined)?.['content-type'],
    ).toBeUndefined();
  });

  it('encodes the match id', async () => {
    const { client, calls } = built(json(RECOMMENDATION));

    await requestRematch('../../admin', client);

    expect(calls[0]?.url).not.toContain('/admin');
  });

  it('answers with the new recommendation', async () => {
    const { client } = built(json(RECOMMENDATION));

    const outcome = await requestRematch(MATCH_ID, client);

    expect(isRematch(outcome)).toBe(true);
    expect(outcome).toMatchObject({ attempt: 2, previousTherapistName: 'Ananya Mehra' });
  });

  it('answers with "nobody left" as an answer, not as an error', async () => {
    const { client } = built(json(NOTHING_LEFT));

    const outcome = await requestRematch(MATCH_ID, client);

    // A `200`. The person asked a question and "there is nobody else" is the answer to
    // it; a throw here would make the page say "not found", which is a claim about a
    // system rather than a statement about the pool.
    expect(isRematch(outcome)).toBe(false);
    expect(outcome).toEqual(NOTHING_LEFT);
  });

  it('has a shortcut for a caller that has already handled "nobody left"', async () => {
    const { client } = built(json(NOTHING_LEFT));

    expect(await requestRematchRecommendation(MATCH_ID, client)).toBeNull();
  });

  it('refuses a recommendation that is missing a field it needs', async () => {
    // Every field is present on a first match too — as `1`, `null` and `[]` — so a
    // response without them is a version skew, not a legitimate shape.
    const { client } = built(json({ ...RECOMMENDATION, attempt: undefined }));

    await expect(requestRematch(MATCH_ID, client)).rejects.toThrow(/expected shape/i);
  });

  it('refuses a "nobody left" that is missing its count', async () => {
    const { client } = built(json({ outcome: 'no_candidate' }));

    await expect(requestRematch(MATCH_ID, client)).rejects.toThrow(/expected shape/i);
  });
});
