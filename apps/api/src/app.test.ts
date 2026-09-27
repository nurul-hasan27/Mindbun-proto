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
    });
  });

  it('reads values from the environment', () => {
    const config = readServerConfig({
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '8080',
      API_LOG_LEVEL: 'warn',
      API_CORS_ORIGIN: 'https://app.example, https://admin.example',
    });

    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'warn',
      corsOrigins: ['https://app.example', 'https://admin.example'],
    });
  });

  it('rejects values it cannot understand', () => {
    expect(() => readServerConfig({ API_PORT: 'soon' })).toThrow(/API_PORT/);
    expect(() => readServerConfig({ API_LOG_LEVEL: 'loud' })).toThrow(/API_LOG_LEVEL/);
    expect(() => readServerConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => readServerConfig({ API_CORS_ORIGIN: ' , ' })).toThrow(/API_CORS_ORIGIN/);
  });
});
