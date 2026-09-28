import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { serviceVersion, type HealthResponse } from '../schemas/health.js';

const app = buildApp();

describe('GET /api/v1/health', () => {
  it('reports the service, its version and the time of the check', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const body: HealthResponse = response.json<HealthResponse>();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('why-this-match-api');
    expect(body.version).toBe(serviceVersion);
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns a timestamp that is a valid ISO date', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body: HealthResponse = response.json<HealthResponse>();

    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('matches its own response schema exactly (no extra fields)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body: Record<string, unknown> = response.json<Record<string, unknown>>();

    expect(Object.keys(body).sort()).toEqual(['service', 'status', 'timestamp', 'version']);
  });

  it('ignores query parameters rather than failing on them', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health?verbose=1' });

    expect(response.statusCode).toBe(200);
  });

  it('does not answer on the un-versioned path', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(404);
  });

  it('rejects methods it does not implement', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/health' });

    expect(response.statusCode).toBe(404);
  });
});

describe('buildApp with CORS enabled', () => {
  const browserApp = buildApp({ corsOrigins: ['http://localhost:5173'] });

  it('allows a configured browser origin', async () => {
    const response = await browserApp.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow an origin that was never configured', async () => {
    const response = await browserApp.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://somewhere-else.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a CORS preflight for the versioned API', async () => {
    const response = await browserApp.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('GET');
  });
});
