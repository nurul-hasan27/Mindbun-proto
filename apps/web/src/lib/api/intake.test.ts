import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { fetchIntakeVocabulary, submitIntake } from './intake';
import { neverSettles, stubFetch, type StubHandler } from '../../test/stubFetch';
import { API_V1 } from './version';
import type { IntakeDraftPayload, IntakeVocabulary } from './types';

const BASE_URL = 'http://api.test:4000';

const VOCABULARY: IntakeVocabulary = {
  areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
  communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
  contextualExperience: [{ key: 'relocation', name: 'Relocation' }],
  languages: [{ code: 'en', name: 'English' }],
  sessionFormats: [{ key: 'online', name: 'Online' }],
};

const PAYLOAD: IntakeDraftPayload = {
  sessionId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8',
  submissionId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e9',
  areasOfWork: ['relationships'],
  communicationStyles: ['exploratory'],
  contextualExperiences: [],
  languages: ['en'],
  sessionFormats: ['online'],
  availability: null,
  openToGuidance: false,
  rawText: 'I would like to talk about work.',
};

const RECEIPT = {
  intakeId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea',
  receivedAt: '2026-09-28T12:00:00.000Z',
};

function clientReturning(handler: StubHandler) {
  const { fetchImpl, calls } = stubFetch(handler);
  return { client: createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl }), calls };
}

/**
 * The body a call actually sent, parsed.
 *
 * The client serialises with `JSON.stringify`, so a test asserting on the payload
 * should not have to guess whether it is a string.
 */
function sentBody(body: BodyInit | null | undefined): IntakeDraftPayload {
  if (typeof body !== 'string') {
    throw new Error('expected a serialised body');
  }

  return JSON.parse(body) as IntakeDraftPayload;
}

describe('fetchIntakeVocabulary', () => {
  it('reads the vocabulary the questions are asked from', async () => {
    const { client, calls } = clientReturning(() => ({ json: VOCABULARY }));

    const vocabulary = await fetchIntakeVocabulary(client);

    expect(calls[0]?.url).toBe(`${BASE_URL}${API_V1}/intake/vocabulary`);
    expect(vocabulary.languages).toEqual([{ code: 'en', name: 'English' }]);
  });

  it('refuses a response that is not a vocabulary, rather than offering no choices', async () => {
    const { client } = clientReturning(() => ({ json: { areasOfWork: [] } }));

    await expect(fetchIntakeVocabulary(client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('refuses a 200 that is not an object at all', async () => {
    const { client } = clientReturning(() => ({ json: 'nope' }));

    await expect(fetchIntakeVocabulary(client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('reports an unreachable service as a network error', async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl });

    await expect(fetchIntakeVocabulary(client)).rejects.toMatchObject({ kind: 'network' });
  });

  it('gives up on a service that never answers', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 10, fetchImpl });

    await expect(fetchIntakeVocabulary(client)).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('submitIntake', () => {
  it('posts the payload to the versioned endpoint', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECEIPT }));

    const receipt = await submitIntake(PAYLOAD, client);

    expect(calls[0]?.url).toBe(`${BASE_URL}${API_V1}/intakes`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(sentBody(calls[0]?.init.body)).toEqual(PAYLOAD);
    expect(receipt.intakeId).toBe(RECEIPT.intakeId);
  });

  it('declares the content type, so the service can read the body', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECEIPT }));

    await submitIntake(PAYLOAD, client);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });

  it('sends the same submissionId on a retry, which is what makes one safe', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECEIPT }));

    await submitIntake(PAYLOAD, client);
    await submitIntake(PAYLOAD, client);

    const first = sentBody(calls[0]?.init.body);
    const second = sentBody(calls[1]?.init.body);

    expect(first.submissionId).toBe(second.submissionId);
    expect(first.sessionId).toBe(second.sessionId);
  });

  it('sends the note even when it is the only answer', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECEIPT }));

    await submitIntake(
      { ...PAYLOAD, areasOfWork: [], rawText: 'I am not sure where to start.' },
      client,
    );

    const body = sentBody(calls[0]?.init.body);
    expect(body.rawText).toBe('I am not sure where to start.');
    expect(body.areasOfWork).toEqual([]);
  });

  it('sends no availability rather than an empty object', async () => {
    const { client, calls } = clientReturning(() => ({ json: RECEIPT }));

    await submitIntake({ ...PAYLOAD, availability: null }, client);

    const body = sentBody(calls[0]?.init.body);
    expect(body.availability).toBeNull();
  });

  it('reports a rejected request as a typed error carrying the status', async () => {
    const { client } = clientReturning(() => ({
      status: 400,
      statusText: 'Bad Request',
      json: {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Choose at least one language you would be comfortable speaking.',
      },
    }));

    await expect(submitIntake(PAYLOAD, client)).rejects.toMatchObject({
      kind: 'http',
      status: 400,
    });
  });

  it('reports an unavailable store as 503, so a person is told to try again', async () => {
    const { client } = clientReturning(() => ({
      status: 503,
      statusText: 'Service Unavailable',
      json: { statusCode: 503, error: 'Service Unavailable', message: 'Store unavailable.' },
    }));

    await expect(submitIntake(PAYLOAD, client)).rejects.toMatchObject({
      kind: 'http',
      status: 503,
    });
  });

  it('refuses a receipt that is not a receipt', async () => {
    const { client } = clientReturning(() => ({ json: { ok: true } }));

    await expect(submitIntake(PAYLOAD, client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('gives up on a service that never answers, so nobody waits forever', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 10, fetchImpl });

    await expect(submitIntake(PAYLOAD, client)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('can be cancelled, which is how leaving the page stops a send', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 5_000, fetchImpl });
    const controller = new AbortController();

    const pending = submitIntake(PAYLOAD, client, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });
});
