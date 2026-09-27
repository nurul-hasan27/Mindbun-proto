import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const app = buildApp();

describe('GET /health', () => {
  it('responds with { status: "ok" }', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('adds no extra fields to the payload', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(Object.keys(response.json()).sort()).toEqual(['status']);
  });

  it('is reachable without authentication or query parameters', async () => {
    const response = await app.inject({ method: 'GET', url: '/health?probe=1' });

    expect(response.statusCode).toBe(200);
  });
});
