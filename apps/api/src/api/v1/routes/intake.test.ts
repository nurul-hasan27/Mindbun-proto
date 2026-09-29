import { describe, expect, it, vi, type MockedFunction } from 'vitest';
import { buildApp } from '../../../app.js';
import type { IntakeRepository } from '../../../data/intake/intakeRepository.js';
import type { IntakeRequest, IntakeVocabulary } from '../../../data/intake/intakeTypes.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';

const VOCABULARY: IntakeVocabulary = {
  areasOfWork: [
    { key: 'relationships', name: 'Relationships' },
    { key: 'career-transitions', name: 'Career transitions' },
  ],
  communicationStyles: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
  ],
  contextualExperience: [
    { key: 'relocation', name: 'Relocation' },
    { key: 'family-expectations', name: 'Family expectations' },
  ],
  languages: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
  ],
  sessionFormats: [
    { key: 'online', name: 'Online' },
    { key: 'in-person', name: 'In person' },
  ],
};

const SESSION = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8';
const SUBMISSION = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e9';
const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';

const RECEIPT = { intakeId: INTAKE_ID, receivedAt: '2026-09-28T12:00:00.000Z' };

const VALID_BODY = {
  sessionId: SESSION,
  submissionId: SUBMISSION,
  areasOfWork: ['relationships'],
  communicationStyles: ['exploratory'],
  contextualExperiences: ['relocation'],
  languages: ['en', 'hi'],
  sessionFormats: ['online'],
  availability: {
    timezone: 'Asia/Kolkata',
    windows: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 }],
  },
  openToGuidance: false,
  rawText: 'I would like to talk about work.',
};

interface FakeOptions {
  readonly readVocabulary?: MockedFunction<IntakeRepository['readVocabulary']>;
  readonly submit?: MockedFunction<IntakeRepository['submit']>;
}

function fakeRepository(options: FakeOptions = {}): IntakeRepository {
  return {
    readVocabulary: options.readVocabulary ?? vi.fn(() => Promise.resolve(VOCABULARY)),
    submit: options.submit ?? vi.fn(() => Promise.resolve(RECEIPT)),
  };
}

describe('GET /api/v1/intake/vocabulary', () => {
  it('returns everything the client may ask about', async () => {
    const app = buildApp({ intakes: fakeRepository() });

    const response = await app.inject({ method: 'GET', url: '/api/v1/intake/vocabulary' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(VOCABULARY);
  });

  it('reports an unreachable store as 503', async () => {
    const app = buildApp({
      intakes: fakeRepository({
        readVocabulary: vi.fn(() => Promise.reject(new DataStoreUnavailableError('down'))),
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/intake/vocabulary' });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ message: string }>().message).toBe(
      'We could not reach where answers are stored right now.',
    );
  });

  it('answers 503 when the service was started without a store', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/intake/vocabulary' });

    expect(response.statusCode).toBe(503);
  });
});

describe('POST /api/v1/intakes', () => {
  it('stores a valid intake and returns a receipt', async () => {
    const submit = vi.fn(() => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(RECEIPT);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('passes a normalised, storable request to the store', async () => {
    const submit = vi.fn((_request: IntakeRequest) => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: { ...VALID_BODY, languages: ['hi', 'en', 'en'] },
    });

    const request = submit.mock.calls[0]?.[0];
    expect(request?.languages).toEqual(['en', 'hi']);
    expect(request?.sessionId).toBe(SESSION);
    expect(request?.submissionId).toBe(SUBMISSION);
  });

  it('accepts an intake with no availability at all', async () => {
    const submit = vi.fn((_request: IntakeRequest) => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: { ...VALID_BODY, availability: undefined },
    });

    expect(response.statusCode).toBe(200);
    expect(submit.mock.calls[0]?.[0].availability).toBeNull();
  });

  it('accepts an intake that carries nothing but the person own words', async () => {
    const submit = vi.fn((_request: IntakeRequest) => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: {
        ...VALID_BODY,
        areasOfWork: [],
        communicationStyles: [],
        contextualExperiences: [],
        rawText: 'I am not sure where to begin.',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('refuses a request that is missing something required', async () => {
    const submit = vi.fn(() => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: { ...VALID_BODY, languages: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/at least one language/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses a keyword the database has never heard of', async () => {
    const submit = vi.fn(() => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: { ...VALID_BODY, areasOfWork: ['unheard-of'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/not something we recognise/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses an availability that is not a real window', async () => {
    const app = buildApp({ intakes: fakeRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: {
        ...VALID_BODY,
        availability: {
          timezone: 'Asia/Kolkata',
          windows: [{ dayOfWeek: 'MONDAY', startMinute: 1200, endMinute: 600 }],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/ends before it starts/i);
  });

  it('refuses a body that is valid JSON but not an object', async () => {
    const submit = vi.fn(() => Promise.resolve(RECEIPT));
    const app = buildApp({ intakes: fakeRepository({ submit }) });

    for (const payload of ['"a string"', '42', '["an","array"]', 'null']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/intakes',
        headers: { 'content-type': 'application/json' },
        payload,
      });

      expect(response.statusCode, payload).toBe(400);
    }

    expect(submit).not.toHaveBeenCalled();
  });

  it('answers a body that is not JSON in the shared error shape', async () => {
    const app = buildApp({ intakes: fakeRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ statusCode: number; error: string; message: string }>()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'The request was not readable as JSON.',
    });
  });

  it('reports an unreachable store as 503, not as a crash', async () => {
    const app = buildApp({
      intakes: fakeRepository({
        submit: vi.fn(() => Promise.reject(new DataStoreUnavailableError('down'))),
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: VALID_BODY,
    });

    expect(response.statusCode).toBe(503);
  });

  it('never puts anything from the request into a failure body', async () => {
    const app = buildApp({
      intakes: fakeRepository({
        submit: vi.fn(() =>
          Promise.reject(
            new DataStoreUnavailableError('postgres://wtm:wtm@127.0.0.1:5432/why_this_match'),
          ),
        ),
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: { ...VALID_BODY, rawText: 'I feel like I am drowning most days.' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('drowning');
    expect(response.body).not.toContain('wtm');
    expect(response.body).not.toContain('postgres://');
  });
});
