import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readServerConfig } from './config/env.js';

describe('buildApp', () => {
  it('keeps the infrastructure health probe working', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('exposes the application API under /api/v1', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
  });

  it('answers 404 for routes that do not exist', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/matches' });

    expect(response.statusCode).toBe(404);
  });
});

describe('readServerConfig', () => {
  it('falls back to safe defaults when the environment is empty', () => {
    expect(readServerConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 4000,
      logLevel: 'info',
      corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      databaseUrl: '',
      // With nothing set the assistant is the deterministic mock. A clone and a `npm run
      // dev` give a working product with no account, which is the only reason a reviewer
      // without a key can see any of this.
      ai: {
        provider: 'mock',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        timeoutMs: 20_000,
      },
    });
  });

  it('reads values from the environment', () => {
    const config = readServerConfig({
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '8080',
      API_LOG_LEVEL: 'warn',
      API_CORS_ORIGIN: 'https://app.example, https://admin.example',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/why_this_match',
    });

    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'warn',
      corsOrigins: ['https://app.example', 'https://admin.example'],
      databaseUrl: 'postgresql://user:pass@localhost:5432/why_this_match',
      ai: {
        provider: 'mock',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        timeoutMs: 20_000,
      },
    });
  });

  it('reads the AI configuration from the environment, and nowhere else', () => {
    const config = readServerConfig({
      AI_PROVIDER: 'openai-compatible',
      AI_API_KEY: 'sk-live-value',
      AI_BASE_URL: 'https://gateway.internal/v1',
      AI_MODEL: 'llama-3.1-70b',
      AI_TIMEOUT_MS: '9000',
    });

    expect(config.ai).toEqual({
      provider: 'openai-compatible',
      apiKey: 'sk-live-value',
      baseUrl: 'https://gateway.internal/v1',
      model: 'llama-3.1-70b',
      timeoutMs: 9_000,
    });
  });

  it('refuses to start on a real provider with no key, rather than failing silently', () => {
    // The one combination that is a genuine mistake: an explicit request for a provider that
    // cannot work. A missing key alone is fine — that is the mock.
    expect(() => readServerConfig({ AI_PROVIDER: 'openai-compatible' })).toThrow(/AI_API_KEY/);
  });

  it('rejects values it cannot understand', () => {
    expect(() => readServerConfig({ API_PORT: 'soon' })).toThrow(/API_PORT/);
    expect(() => readServerConfig({ API_LOG_LEVEL: 'loud' })).toThrow(/API_LOG_LEVEL/);
    expect(() => readServerConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => readServerConfig({ API_CORS_ORIGIN: ' , ' })).toThrow(/API_CORS_ORIGIN/);
    expect(() => readServerConfig({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
