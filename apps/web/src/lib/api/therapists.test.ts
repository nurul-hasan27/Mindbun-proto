import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';
import { getTherapist, getTherapists } from './therapists';
import { neverSettles, stubFetch, type StubHandler } from '../../test/stubFetch';

const BASE_URL = 'http://api.test:4000';
const ID = '02004680-bd62-4f61-8fde-35a61b79dfdc';

function clientReturning(handler: StubHandler) {
  const { fetchImpl, calls } = stubFetch(handler);
  return { client: createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl }), calls };
}

const SUMMARY = {
  id: ID,
  displayName: 'Ananya Mehra',
  headline: 'Warm, curious, reflective',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 9,
  languages: [{ key: 'en', name: 'English' }],
  areasOfWork: [{ key: 'career-transitions', name: 'Career transitions' }],
  communicationStyles: [{ key: 'warm', name: 'Warm' }],
} as const;

const PAGE = {
  items: [SUMMARY],
  pagination: { total: 1, take: 1, skip: 0, hasMore: false },
} as const;

const PROFILE = {
  ...SUMMARY,
  bio: 'Therapy can be a place to slow down.',
  approaches: [{ key: 'reflective', name: 'Reflective' }],
  contextualExperience: [],
  sessionFormats: [{ key: 'online', name: 'Online' }],
  availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 }],
} as const;

describe('getTherapists', () => {
  it('requests the versioned endpoint and returns the page', async () => {
    const { client, calls } = clientReturning(() => ({ json: PAGE }));

    const page = await getTherapists({}, client);

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/therapists`);
    expect(page.pagination.total).toBe(1);
    expect(page.items[0]?.displayName).toBe('Ananya Mehra');
  });

  it('sends only the filters that were given', async () => {
    const { client, calls } = clientReturning(() => ({ json: PAGE }));

    await getTherapists({ take: 5, skip: 10, language: 'hi' }, client);
    await getTherapists({ area: 'career-transitions' }, client);

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/therapists?take=5&skip=10&language=hi`);
    expect(calls[1]?.url).toBe(`${BASE_URL}/api/v1/therapists?area=career-transitions`);
  });

  it('reports a rejected filter as a typed error', async () => {
    const { client } = clientReturning(() => ({
      status: 400,
      statusText: 'Bad Request',
      json: { statusCode: 400, error: 'Bad Request', message: 'No language is recorded as zz.' },
    }));

    await expect(getTherapists({ language: 'zz' }, client)).rejects.toMatchObject({
      kind: 'http',
      status: 400,
    });
  });

  it('rejects a 200 that is not a page, rather than returning nothing useful', async () => {
    const { client } = clientReturning(() => ({ json: PROFILE }));

    await expect(getTherapists({}, client)).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('getTherapist', () => {
  it('requests one profile by id', async () => {
    const { client, calls } = clientReturning(() => ({ json: PROFILE }));

    const profile = await getTherapist(ID, client);

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/therapists/${ID}`);
    expect(profile.displayName).toBe('Ananya Mehra');
    expect(profile.availability[0]?.startMinute).toBe(1080);
  });

  it('keeps a 404 distinguishable from an unavailable service', async () => {
    const { client } = clientReturning(() => ({
      status: 404,
      statusText: 'Not Found',
      json: { statusCode: 404, error: 'Not Found', message: 'No therapist has that id.' },
    }));

    const error = await getTherapist(ID, client).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: 'http', status: 404 });
  });

  it('reports a 400 for a malformed id', async () => {
    const { client } = clientReturning(() => ({
      status: 400,
      statusText: 'Bad Request',
      json: { statusCode: 400, error: 'Bad Request', message: 'A therapist id must be a UUID.' },
    }));

    await expect(getTherapist('not-a-uuid', client)).rejects.toMatchObject({
      kind: 'http',
      status: 400,
    });
  });

  it('reports an unreachable service as a network error', async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl });

    await expect(getTherapist(ID, client)).rejects.toMatchObject({ kind: 'network' });
  });

  it('gives up on a service that never answers', async () => {
    const { fetchImpl } = stubFetch(neverSettles);
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 10, fetchImpl });

    await expect(getTherapist(ID, client)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('encodes the id so it cannot escape the path', async () => {
    const { client, calls } = clientReturning(() => ({ json: PROFILE }));

    await getTherapist('a/../b', client);

    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/therapists/a%2F..%2Fb`);
  });

  it('rejects a 200 that is not a profile', async () => {
    const { client } = clientReturning(() => ({ json: PAGE }));

    await expect(getTherapist(ID, client)).rejects.toMatchObject({ kind: 'parse' });
  });
});
