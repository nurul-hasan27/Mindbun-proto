import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { ApiError } from './errors';
import { neverSettles, stubFetch, type StubHandler } from '../../test/stubFetch';

const BASE_URL = 'http://api.test:4000';

function clientWith(handler: StubHandler, timeoutMs = 1_000) {
  const { fetchImpl, calls } = stubFetch(handler);
  return { client: createApiClient({ baseUrl: BASE_URL, timeoutMs, fetchImpl }), calls };
}

describe('createApiClient', () => {
  it('returns parsed JSON for a successful request', async () => {
    const { client, calls } = clientWith(() => ({ json: { status: 'ok' } }));

    await expect(client.get<{ status: string }>('/api/v1/health')).resolves.toEqual({
      status: 'ok',
    });
    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/health`);
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('strips a trailing slash from the base URL', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ json: {} }));
    const client = createApiClient({ baseUrl: `${BASE_URL}//`, timeoutMs: 1_000, fetchImpl });

    await client.get('/api/v1/health');

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/health`);
  });

  it('appends query parameters and skips empty ones', async () => {
    const { client, calls } = clientWith(() => ({ json: {} }));

    await client.get('/api/v1/search', { query: { q: 'anxiety', page: 2, cursor: undefined } });

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/search?q=anxiety&page=2`);
  });

  it('sends a JSON body and content type when one is given', async () => {
    const { client, calls } = clientWith(() => ({ json: { ok: true } }));

    await client.request('/api/v1/intake', { method: 'POST', body: { language: 'en' } });

    const init = calls[0]?.init;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"language":"en"}');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('turns a non-2xx response into an http ApiError', async () => {
    const { client } = clientWith(() => ({ status: 503, statusText: 'Service Unavailable' }));

    const error = await client.get('/api/v1/health').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 503 });
    expect((error as ApiError).isRetryable).toBe(true);
  });

  it('turns a transport failure into a network ApiError', async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl });

    const error = await client.get('/api/v1/health').catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: 'network' });
    expect((error as ApiError).detail).toContain('Failed to fetch');
  });

  it('turns a non-JSON body into a parse ApiError', async () => {
    const { client } = clientWith(() => ({ text: '<html>proxy error</html>' }));

    const error = await client.get('/api/v1/health').catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: 'parse', status: 200 });
  });

  it('gives up on a request that outlives the timeout', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 10, fetchImpl });

    const error = await client.get('/api/v1/health').catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: 'timeout' });
  });

  it('reports a caller-cancelled request as aborted, not as a failure', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 5_000, fetchImpl });
    const controller = new AbortController();

    const promise = client.get('/api/v1/health', { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('refuses to call anything when no base URL is configured', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ json: {} }));
    const client = createApiClient({ baseUrl: '', timeoutMs: 1_000, fetchImpl });

    await expect(client.get('/api/v1/health')).rejects.toMatchObject({ kind: 'config' });
    expect(calls).toHaveLength(0);
  });
});
