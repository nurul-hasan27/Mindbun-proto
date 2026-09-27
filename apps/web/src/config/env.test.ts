import { describe, expect, it } from 'vitest';
import { env } from './env';

describe('env', () => {
  it('exposes a non-empty API base url', () => {
    expect(env.apiBaseUrl).toMatch(/^https?:\/\//);
  });
});
