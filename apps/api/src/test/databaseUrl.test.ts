import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database.js';

const URL_DEV = 'postgresql://wtm:wtm@127.0.0.1:5432/why_this_match?schema=public';
const URL_TEST = 'postgresql://wtm:wtm@127.0.0.1:5432/why_this_match_test?schema=public';

describe('testDatabaseUrl', () => {
  it('returns the test database when it is configured separately', () => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: URL_TEST, DATABASE_URL: URL_DEV })).toBe(URL_TEST);
  });

  it('refuses to run when the test database is the development database', () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: URL_DEV, DATABASE_URL: URL_DEV })).toThrow(
      /same/i,
    );
  });

  it('refuses to guess when TEST_DATABASE_URL is missing', () => {
    expect(() => testDatabaseUrl({ DATABASE_URL: URL_DEV })).toThrow(/TEST_DATABASE_URL/);
    expect(() => testDatabaseUrl({})).toThrow(/TEST_DATABASE_URL/);
  });

  it('ignores surrounding whitespace rather than comparing a mangled string', () => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: `  ${URL_TEST} `, DATABASE_URL: URL_DEV })).toBe(
      URL_TEST,
    );
  });
});
