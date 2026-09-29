import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { ApiError } from './errors';
import { requestAiExtraction, requestAiTurn } from './ai';
import {
  neverSettles,
  stubFetch,
  type StubHandler,
  type StubResponseInit,
} from '../../test/stubFetch';

/**
 * The AI client.
 *
 * These tests are mostly about *not trusting the response*. A provider's output is whatever
 * came back over a network, and this client is the last place before it becomes React state
 * and then somebody's intake — so the shape checks here are a control, not tidiness.
 */

const BASE_URL = 'http://api.test:4000';

function clientReturning(handler: StubHandler) {
  const { fetchImpl, calls } = stubFetch(handler);
  return { client: createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl }), calls };
}

const ok = (json: unknown): StubResponseInit => ({ json });

/** The request body, parsed. The client always sends a JSON string. */
function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') {
    throw new Error(`Expected a JSON string body, received ${typeof body}.`);
  }

  return JSON.parse(body);
}

const MESSAGES = [{ role: 'user' as const, text: 'Work has been stressful.' }];

const TURN_REPLY = { reply: 'Tell me more.', readyToSummarise: false, provider: 'mock' } as const;

const EXTRACTION = {
  signals: [
    {
      category: 'area',
      key: 'work-stress',
      confidence: 'high',
      source: 'user_message',
      explanation: 'You mentioned work.',
      target: { kind: 'draft', field: 'areasOfWork', label: 'Work stress' },
    },
  ],
  notUnderstood: [],
  surplus: [],
  provider: 'mock',
} as const;

describe('requestAiTurn', () => {
  it('posts the transcript and returns the reply', async () => {
    const { client, calls } = clientReturning(() => ok(TURN_REPLY));

    const turn = await requestAiTurn(MESSAGES, {}, client);

    expect(turn).toEqual(TURN_REPLY);
    expect(parseBody(calls[0]?.init.body)).toEqual({ messages: MESSAGES, known: {} });
  });

  it('posts, so nothing typed can end up in a URL', async () => {
    const { client, calls } = clientReturning(() => ok(TURN_REPLY));

    await requestAiTurn(MESSAGES, {}, client);

    expect(calls[0]?.init.method).toBe('POST');
    // A GET would put what someone said into a URL, a proxy log and a Referer header.
    expect(calls[0]?.url).not.toContain('stressful');
    expect(calls[0]?.url).toContain('/ai/intake/turn');
  });

  it('refuses a reply that is not the expected shape', async () => {
    for (const body of [
      { reply: 'x', readyToSummarise: 'no', provider: 'mock' },
      { reply: 42, readyToSummarise: false, provider: 'mock' },
      { readyToSummarise: false, provider: 'mock' },
      'a string',
      null,
    ]) {
      const { client } = clientReturning(() => ok(body));
      await expect(requestAiTurn(MESSAGES, {}, client)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('surfaces a 503 as an error the interface can tell apart', async () => {
    // The status is what lets the page say "switched off" rather than "something broke", and
    // the two lead to different actions.
    const { client } = clientReturning(() => ({
      status: 503,
      json: { statusCode: 503, error: 'x', message: 'The assistant is switched off.' },
    }));

    const failure = await requestAiTurn(MESSAGES, {}, client).catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(503);
  });

  it('never puts the transcript into the error it throws', async () => {
    const { client } = clientReturning(() => ({ status: 502, json: { message: 'no' } }));

    const failure = await requestAiTurn(MESSAGES, {}, client).catch((reason: unknown) => reason);
    const detail = (failure as ApiError).detail;

    // The detail reaches a person in a collapsible panel, so a body echoed into it would put
    // someone's own words on a page they could screenshot.
    expect(detail).not.toContain('stressful');
  });
});

describe('requestAiExtraction', () => {
  it('returns the suggestions', async () => {
    const { client } = clientReturning(() => ok(EXTRACTION));

    const result = await requestAiExtraction(MESSAGES, client);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.key).toBe('work-stress');
    expect(result.suggestions[0]?.target).toEqual({
      kind: 'draft',
      field: 'areasOfWork',
      label: 'Work stress',
    });
  });

  it('refuses a suggestion whose target is missing or shapeless', async () => {
    // A suggestion with no destination cannot be shown: the interface would have nothing to
    // write it to, and would either drop it silently or guess.
    for (const target of [undefined, null, {}, { kind: 7 }, { label: 'x' }]) {
      const { client } = clientReturning(() =>
        ok({ ...EXTRACTION, signals: [{ ...EXTRACTION.signals[0], target }] }),
      );

      await expect(requestAiExtraction(MESSAGES, client)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('refuses a confidence outside the three it can say out loud', async () => {
    for (const confidence of ['certain', 'high-ish', 3]) {
      const { client } = clientReturning(() =>
        ok({ ...EXTRACTION, signals: [{ ...EXTRACTION.signals[0], confidence }] }),
      );

      await expect(requestAiExtraction(MESSAGES, client)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('refuses a source that is not what the person said', async () => {
    const { client } = clientReturning(() =>
      ok({ ...EXTRACTION, signals: [{ ...EXTRACTION.signals[0], source: 'model_prior' }] }),
    );

    await expect(requestAiExtraction(MESSAGES, client)).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses a signal that is not an object at all', async () => {
    for (const signal of [null, 'text', 7, []]) {
      const { client } = clientReturning(() => ok({ ...EXTRACTION, signals: [signal] }));

      await expect(requestAiExtraction(MESSAGES, client)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('tolerates a server that predates the surplus field', async () => {
    const { surplus: _omitted, ...older } = EXTRACTION;
    const { client } = clientReturning(() => ok(older));

    const result = await requestAiExtraction(MESSAGES, client);

    // "There was nothing more" and "this server does not report surplus" are different
    // claims, and a missing line is not worth failing a person's suggestions over.
    expect(result.surplus).toEqual([]);
    expect(result.suggestions).toHaveLength(1);
  });

  it('refuses a whole response that is the wrong shape', async () => {
    for (const body of [null, 'text', 42, { signals: 'no' }, { provider: 'mock' }]) {
      const { client } = clientReturning(() => ok(body));
      await expect(requestAiExtraction(MESSAGES, client)).rejects.toBeInstanceOf(ApiError);
    }
  });
});

describe('aborting', () => {
  it('passes a signal through, so a stale turn can be dropped', async () => {
    const controller = new AbortController();
    const { client, calls } = clientReturning(() => ok(TURN_REPLY));

    await requestAiTurn(MESSAGES, {}, client, { signal: controller.signal });

    // The client hands `fetch` its *own* controller and forwards the caller's abort onto it,
    // so the identity differs by design. What has to hold is that a signal reaches the
    // network layer at all: without one, a superseded turn could not be dropped and a slow
    // reply would overwrite the one that was actually asked for.
    expect(calls[0]?.init.signal).toBeDefined();
  });

  it('reports an abort as an abort rather than a failure', async () => {
    // A long client timeout, so the cancellation is what ends the request and the kind is
    // genuinely `aborted` rather than `timeout`.
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 5_000, fetchImpl });
    const controller = new AbortController();

    const pending = requestAiTurn(MESSAGES, {}, client, { signal: controller.signal });
    controller.abort();

    const failure = await pending.catch((reason: unknown) => reason);

    // A superseded turn is not an error to show a person: the interface ignores this kind,
    // and the copy would otherwise claim something had gone wrong.
    expect((failure as ApiError).kind).toBe('aborted');
  });
});
