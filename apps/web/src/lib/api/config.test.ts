import { describe, expect, it, vi } from 'vitest';
import { apiConfig, isDev, readTimeout } from './config';

describe('apiConfig', () => {
  it('resolves a base URL, trimmed of surrounding whitespace', () => {
    expect(apiConfig.baseUrl).toBe(apiConfig.baseUrl.trim());
  });

  it('always has a positive timeout', () => {
    expect(apiConfig.timeoutMs).toBeGreaterThan(0);
  });

  it('assumes the local API in development, and nothing in a build', () => {
    if (isDev) {
      expect(apiConfig.baseUrl).toBe('http://127.0.0.1:4000');
    } else {
      expect(apiConfig.baseUrl).toBe('');
    }
  });
});

describe('readTimeout', () => {
  it('uses the fallback when nothing is configured', () => {
    expect(readTimeout(undefined, 8_000)).toBe(8_000);
    expect(readTimeout('  ', 8_000)).toBe(8_000);
  });

  it('reads a positive number', () => {
    expect(readTimeout('2500', 8_000)).toBe(2_500);
  });

  it('warns and falls back for values that are not positive numbers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(readTimeout('soon', 8_000)).toBe(8_000);
    expect(readTimeout('-1', 8_000)).toBe(8_000);
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });
});
