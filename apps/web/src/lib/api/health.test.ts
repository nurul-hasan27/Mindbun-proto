import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { API_V1, fetchHealthStatus } from './health';
import { stubFetch, type StubHandler } from '../../test/stubFetch';

const BASE_URL = 'http://api.test:4000';

function clientReturning(handler: StubHandler) {
  const { fetchImpl, calls } = stubFetch(handler);
  return { client: createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl }), calls };
}

const HEALTH_PAYLOAD = {
  status: 'ok',
  service: 'why-this-match-api',
  version: '0.2.0',
  timestamp: '2026-09-28T10:00:00.000Z',
} as const;

describe('fetchHealthStatus', () => {
  it('calls the versioned health endpoint and returns the status', async () => {
    const { client, calls } = clientReturning(() => ({ json: HEALTH_PAYLOAD }));

    await expect(fetchHealthStatus(client)).resolves.toEqual(HEALTH_PAYLOAD);
    expect(calls[0]?.url).toBe(`${BASE_URL}${API_V1}/health`);
  });

  it('rejects a payload that is missing the expected fields', async () => {
    const { client } = clientReturning(() => ({ json: { status: 'ok' } }));

    await expect(fetchHealthStatus(client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('rejects a payload whose status is not ok', async () => {
    const { client } = clientReturning(() => ({ json: { ...HEALTH_PAYLOAD, status: 'degraded' } }));

    await expect(fetchHealthStatus(client)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('surfaces a failing status code as a retryable error', async () => {
    const { client } = clientReturning(() => ({ status: 500, statusText: 'Server Error' }));

    const error = await fetchHealthStatus(client).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });

  it('forwards the abort signal it is given', async () => {
    const { client } = clientReturning(() => ({ json: HEALTH_PAYLOAD }));
    const controller = new AbortController();

    await fetchHealthStatus(client, { signal: controller.signal });

    // The client subscribes to the caller's signal; nothing should have thrown.
    expect(controller.signal.aborted).toBe(false);
  });
});
