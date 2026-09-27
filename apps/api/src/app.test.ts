import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readServerConfig } from './config/env.js';

describe('buildApp', () => {
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
    });
  });

  it('reads values from the environment', () => {
    const config = readServerConfig({
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '8080',
      API_LOG_LEVEL: 'warn',
    });

    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'warn',
    });
  });

  it('rejects values it cannot understand', () => {
    expect(() => readServerConfig({ API_PORT: 'soon' })).toThrow(/API_PORT/);
    expect(() => readServerConfig({ API_LOG_LEVEL: 'loud' })).toThrow(/API_LOG_LEVEL/);
    expect(() => readServerConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
