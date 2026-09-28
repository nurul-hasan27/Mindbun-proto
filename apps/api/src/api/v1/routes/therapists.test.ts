import { describe, expect, it, vi, type MockedFunction } from 'vitest';
import { buildApp } from '../../../app.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';
import type {
  TherapistProfileView,
  TherapistSummary,
} from '../../../data/therapists/therapistView.js';

const ID = '02004680-bd62-4f61-8fde-35a61b79dfdc';
const OTHER_ID = 'f922df8d-840c-44e8-ae6f-ffd43a76ff30';

const SUMMARY: TherapistSummary = {
  id: ID,
  displayName: 'Ananya Mehra',
  headline: 'Warm, curious, reflective',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 9,
  languages: [
    { key: 'en', name: 'English' },
    { key: 'hi', name: 'Hindi' },
  ],
  areasOfWork: [{ key: 'career-transitions', name: 'Career transitions' }],
  communicationStyles: [{ key: 'warm', name: 'Warm' }],
};

interface ErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
}

interface ListBody {
  readonly items: unknown[];
  readonly pagination: { total: number; take: number; skip: number; hasMore: boolean };
}

const PROFILE: TherapistProfileView = {
  ...SUMMARY,
  bio: 'Therapy can be a place to slow down.',
  approaches: [{ key: 'reflective', name: 'Reflective' }],
  contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
  sessionFormats: [{ key: 'online', name: 'Online' }],
  availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 }],
};

interface FakeOptions {
  readonly list?: MockedFunction<TherapistRepository['list']>;
  readonly findById?: MockedFunction<TherapistRepository['findById']>;
  readonly hasLanguage?: MockedFunction<TherapistRepository['hasLanguage']>;
  readonly hasArea?: MockedFunction<TherapistRepository['hasArea']>;
}

function fakeRepository(options: FakeOptions = {}): TherapistRepository {
  return {
    list: options.list ?? vi.fn(() => Promise.resolve({ items: [SUMMARY], total: 50 })),
    findById: options.findById ?? vi.fn(() => Promise.resolve(PROFILE)),
    hasLanguage: options.hasLanguage ?? vi.fn(() => Promise.resolve(true)),
    hasArea: options.hasArea ?? vi.fn(() => Promise.resolve(true)),
  };
}

describe('GET /api/v1/therapists', () => {
  it('returns a page of summaries with pagination', async () => {
    const app = buildApp({ therapists: fakeRepository() });

    const response = await app.inject({ method: 'GET', url: '/api/v1/therapists' });

    expect(response.statusCode).toBe(200);
    expect(response.json<ListBody>()).toEqual({
      items: [SUMMARY],
      pagination: { total: 50, take: 12, skip: 0, hasMore: true },
    });
  });

  it('passes paging and filters through to the store', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [SUMMARY], total: 50 }));
    const app = buildApp({ therapists: fakeRepository({ list }) });

    await app.inject({
      method: 'GET',
      url: '/api/v1/therapists?take=5&skip=10&language=hi&area=grief-and-loss',
    });

    expect(list).toHaveBeenCalledWith({
      take: 5,
      skip: 10,
      language: 'hi',
      area: 'grief-and-loss',
    });
  });

  it('reports hasMore correctly on the last page', async () => {
    const app = buildApp({
      therapists: fakeRepository({ list: vi.fn(() => Promise.resolve({ items: [], total: 50 })) }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/therapists?take=10&skip=50',
    });

    expect(response.json<ListBody>().pagination).toEqual({
      total: 50,
      take: 10,
      skip: 50,
      hasMore: false,
    });
  });

  it('rejects paging values it cannot use', async () => {
    const app = buildApp({ therapists: fakeRepository() });

    for (const query of ['take=0', 'take=1000', 'skip=-1']) {
      const response = await app.inject({ method: 'GET', url: `/api/v1/therapists?${query}` });

      expect(response.statusCode, query).toBe(400);
      expect(response.json<ErrorBody>().message).toMatch(/whole number/i);
    }
  });

  it('rejects a language that does not exist', async () => {
    const app = buildApp({
      therapists: fakeRepository({ hasLanguage: vi.fn(() => Promise.resolve(false)) }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/therapists?language=zz' });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().message).toContain('zz');
  });

  it('rejects an area of work that does not exist', async () => {
    const app = buildApp({
      therapists: fakeRepository({ hasArea: vi.fn(() => Promise.resolve(false)) }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/therapists?area=nope' });

    expect(response.statusCode).toBe(400);
  });

  it('reports an unavailable store as 503, not as a crash', async () => {
    const app = buildApp({
      therapists: fakeRepository({
        list: vi.fn(() => Promise.reject(new DataStoreUnavailableError('down'))),
        hasLanguage: vi.fn(() => Promise.reject(new DataStoreUnavailableError('down'))),
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/therapists' });

    expect(response.statusCode).toBe(503);
    expect(response.json<ListBody>()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'The therapist store is not available right now.',
    });
  });

  it('answers 503 when the service was started without a store', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/therapists' });

    expect(response.statusCode).toBe(503);
  });
});

describe('GET /api/v1/therapists/:id', () => {
  it('returns one profile', async () => {
    const app = buildApp({ therapists: fakeRepository() });

    const response = await app.inject({ method: 'GET', url: `/api/v1/therapists/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(PROFILE);
  });

  it('answers 404 when there is no such therapist', async () => {
    const app = buildApp({
      therapists: fakeRepository({ findById: vi.fn(() => Promise.resolve(null)) }),
    });

    const response = await app.inject({ method: 'GET', url: `/api/v1/therapists/${OTHER_ID}` });

    expect(response.statusCode).toBe(404);
    expect(response.json<ListBody>()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'No therapist has that id.',
    });
  });

  it('treats a malformed id as a bad request, not a missing therapist', async () => {
    const findById = vi.fn(() => Promise.resolve(PROFILE));
    const app = buildApp({ therapists: fakeRepository({ findById }) });

    const response = await app.inject({ method: 'GET', url: '/api/v1/therapists/not-a-uuid' });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().message).toContain('UUID');
    expect(findById).not.toHaveBeenCalled();
  });

  it('does not leak store internals in an error body', async () => {
    const app = buildApp({
      therapists: fakeRepository({
        findById: vi.fn(() =>
          Promise.reject(new DataStoreUnavailableError('connection string: postgres://wtm:wtm@…')),
        ),
      }),
    });

    const response = await app.inject({ method: 'GET', url: `/api/v1/therapists/${ID}` });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('wtm');
    expect(response.body).not.toContain('postgres://');
  });
});
