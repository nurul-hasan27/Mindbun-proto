import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('app error handling', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a structured 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      status: 'error',
      message: 'Route GET /does-not-exist not found',
    });
  });
});
