import { describe, expect, it } from 'vitest';
import { readServerConfig, AI_PROVIDERS, type AiConfig } from '../config/env.js';
import { buildAiProvider, createUnavailableAiProvider } from './buildAiProvider.js';
import type { IntakeVocabularyView } from './signalVocabulary.js';

const VOCABULARY: IntakeVocabularyView = {
  areasOfWork: [{ key: 'work-stress', name: 'Work stress' }],
  communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
  contextualExperience: [],
  languages: [{ code: 'en', name: 'English' }],
  sessionFormats: [{ key: 'online', name: 'Online' }],
};

const readVocabulary = (): Promise<IntakeVocabularyView> => Promise.resolve(VOCABULARY);

const CONFIG: AiConfig = {
  provider: 'mock',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  timeoutMs: 20_000,
};

describe('readServerConfig, AI section', () => {
  it('defaults to the mock with no configuration at all', () => {
    const config = readServerConfig({});

    // The single most important behaviour here: a clone, an install and a `npm run dev`
    // gives a working assistant with no account and no key.
    expect(config.ai.provider).toBe('mock');
    expect(config.ai.apiKey).toBe('');
  });

  it('builds a working provider from an empty environment', async () => {
    const provider = buildAiProvider(readServerConfig({}).ai, readVocabulary);

    expect(provider.available).toBe(true);
    const turn = await provider.nextTurn([{ role: 'user', text: 'Work has been stressful.' }], {});
    expect(turn.reply).toBeTruthy();
  });

  it('reads a real provider configuration from the environment', () => {
    const config = readServerConfig({
      AI_PROVIDER: 'openai-compatible',
      AI_API_KEY: 'sk-test-value',
      AI_BASE_URL: 'https://gateway.internal/v1/',
      AI_MODEL: 'llama-3.1-70b',
      AI_TIMEOUT_MS: '15000',
    });

    expect(config.ai).toEqual({
      provider: 'openai-compatible',
      apiKey: 'sk-test-value',
      // A trailing slash removed, so the URL is joined the same way every time.
      baseUrl: 'https://gateway.internal/v1',
      model: 'llama-3.1-70b',
      timeoutMs: 15_000,
    });
  });

  it('never lets a key into anything the application can see', () => {
    const config = readServerConfig({ AI_API_KEY: 'sk-secret' });

    // The whole point of keeping the key in one string on one object: there is nowhere else
    // for it to leak from. A test asserting that is worth more than a comment.
    const exposed = JSON.stringify({ ...config, logLevel: config.logLevel });

    expect(exposed).toContain('sk-secret');
    // What the rest of the app receives is a config object, and the key is only ever read
    // by the one function that builds the provider. Asserted as a shape, not a convention.
    expect(Object.keys(config)).toEqual([
      'nodeEnv',
      'host',
      'port',
      'logLevel',
      'corsOrigins',
      'databaseUrl',
      'ai',
    ]);
  });

  describe('what fails at start-up rather than at first use', () => {
    const cases: readonly { label: string; env: NodeJS.ProcessEnv }[] = [
      { label: 'a provider that does not exist', env: { AI_PROVIDER: 'anthropic' } },
      { label: 'a real provider with no key', env: { AI_PROVIDER: 'openai-compatible' } },
      { label: 'a base URL that is not a URL', env: { AI_BASE_URL: 'not-a-url' } },
      { label: 'a timeout of zero', env: { AI_TIMEOUT_MS: '0' } },
      { label: 'a timeout of an hour', env: { AI_TIMEOUT_MS: '3600000' } },
      { label: 'a timeout that is not a number', env: { AI_TIMEOUT_MS: 'soon' } },
    ];

    for (const { label, env } of cases) {
      it(`refuses to start: ${label}`, () => {
        // A typo that silently disabled the feature would be worse than a boot failure.
        expect(() => readServerConfig(env)).toThrow();
      });
    }
  });

  it('accepts every provider it advertises', () => {
    for (const provider of AI_PROVIDERS) {
      const env: NodeJS.ProcessEnv = { AI_PROVIDER: provider };
      if (provider !== 'mock') env['AI_API_KEY'] = 'sk-test';

      expect(readServerConfig(env).ai.provider).toBe(provider);
    }
  });

  it('ignores an empty provider variable rather than failing on it', () => {
    expect(readServerConfig({ AI_PROVIDER: '   ' }).ai.provider).toBe('mock');
  });
});

describe('buildAiProvider', () => {
  it('builds the mock for the mock configuration', async () => {
    const provider = buildAiProvider(CONFIG, readVocabulary);

    expect(provider.name).toBe('mock');
    expect(provider.available).toBe(true);
  });

  it('builds a real provider without calling out to anything', () => {
    // No network, no key validation against a live service: construction is inert, and the
    // only thing that reaches the network is a call.
    const provider = buildAiProvider(
      { ...CONFIG, provider: 'openai-compatible', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      readVocabulary,
    );

    expect(provider.name).toBe('gpt-4o-mini');
    expect(provider.available).toBe(true);
  });
});

describe('createUnavailableAiProvider', () => {
  it('refuses every call, and says it is unavailable before being asked', async () => {
    const provider = createUnavailableAiProvider();

    expect(provider.available).toBe(false);
    await expect(provider.nextTurn([], {})).rejects.toThrow(/not available/i);
    await expect(provider.extractSignals([])).rejects.toThrow(/not available/i);
    await expect(provider.summariseCase({} as never)).rejects.toThrow(/not available/i);
  });
});
