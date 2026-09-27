import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with an ok status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('responds to CORS preflight requests from the web app', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
