import { describe, expect, it } from 'vitest';
import { validateIntakeRequest } from './intakeValidation.js';
import type { IntakeVocabulary } from './intakeTypes.js';

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

const VALID = {
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
} as const;

function reject(body: unknown): string {
  const result = validateIntakeRequest(body, VOCABULARY);

  if (result.ok) {
    throw new Error(`expected a rejection, got a request for ${JSON.stringify(body)}`);
  }

  return result.message;
}

function accept(body: unknown) {
  const result = validateIntakeRequest(body, VOCABULARY);

  if (!result.ok) {
    throw new Error(`expected acceptance, got: ${result.message}`);
  }

  return result.request;
}

describe('a complete intake', () => {
  it('is accepted and returned in a storable shape', () => {
    const request = accept(VALID);

    expect(request.sessionId).toBe(SESSION);
    expect(request.areasOfWork).toEqual(['relationships']);
    expect(request.languages).toEqual(['en', 'hi']);
    expect(request.availability?.windows).toHaveLength(1);
  });

  it('sorts and de-duplicates selections so a stored draft is comparable', () => {
    const request = accept({
      ...VALID,
      languages: ['hi', 'en', 'en'],
      areasOfWork: [],
      rawText: 'Something else entirely.',
    });

    expect(request.languages).toEqual(['en', 'hi']);
  });

  it('accepts an intake that carries nothing but the person own words', () => {
    const request = accept({
      ...VALID,
      areasOfWork: [],
      communicationStyles: [],
      contextualExperiences: [],
      languages: ['en'],
      rawText: '  I am not sure how to put this.  ',
    });

    expect(request.areasOfWork).toEqual([]);
    expect(request.rawText).toBe('I am not sure how to put this.');
  });

  it('accepts "not sure yet" as a complete answer about conversation', () => {
    const request = accept({ ...VALID, communicationStyles: [], openToGuidance: true });

    expect(request.openToGuidance).toBe(true);
    expect(request.communicationStyles).toEqual([]);
  });

  it('treats an absent availability as no preference rather than an error', () => {
    expect(accept({ ...VALID, availability: undefined }).availability).toBeNull();
    expect(accept({ ...VALID, availability: null }).availability).toBeNull();
  });
});

describe('what must be there', () => {
  it('needs a language, because a recommendation cannot ignore it', () => {
    expect(reject({ ...VALID, languages: [] })).toMatch(/at least one language/i);
    expect(reject({ ...VALID, languages: undefined })).toMatch(/at least one language/i);
  });

  it('needs a session format, including the "either" answer', () => {
    expect(reject({ ...VALID, sessionFormats: [] })).toMatch(/how you would like to meet/i);
  });

  it('needs something to work on, however it was offered', () => {
    expect(reject({ ...VALID, areasOfWork: [], rawText: '' })).toMatch(/in your own words/i);
  });
});

describe('identifiers', () => {
  it('requires both identifiers to be UUIDs', () => {
    expect(reject({ ...VALID, sessionId: 'not-a-uuid' })).toMatch(/session identifier/i);
    expect(reject({ ...VALID, submissionId: '123' })).toMatch(/submission identifier/i);
    expect(reject({ ...VALID, sessionId: undefined })).toMatch(/session identifier/i);
  });
});

describe('values the database does not recognise', () => {
  it('rejects an unknown keyword in any list', () => {
    expect(reject({ ...VALID, areasOfWork: ['not-a-thing'] })).toMatch(
      /not something we recognise/i,
    );
    expect(reject({ ...VALID, communicationStyles: ['nope'] })).toMatch(
      /not something we recognise/i,
    );
    expect(reject({ ...VALID, contextualExperiences: ['nope'] })).toMatch(
      /not something we recognise/i,
    );
    expect(reject({ ...VALID, sessionFormats: ['by-carrier-pigeon'] })).toMatch(
      /not something we recognise/i,
    );
  });

  it('rejects a language code that is not in the vocabulary', () => {
    expect(reject({ ...VALID, languages: ['zz'] })).toMatch(/not something we recognise/i);
  });

  it('does not echo the rejected value back in the message', () => {
    const message = reject({
      ...VALID,
      areasOfWork: ['I would rather not say what is really going on'],
    });

    expect(message).not.toContain('rather not say');
  });

  it('rejects a value that is not a list at all', () => {
    expect(reject({ ...VALID, areasOfWork: 'relationships' })).toMatch(/must be a list/i);
    expect(reject({ ...VALID, areasOfWork: [1, 2] })).toMatch(/not something we recognise/i);
  });

  it('rejects a list so long it cannot be a considered answer', () => {
    const many = Array.from({ length: 13 }, (_, index) => `key-${index}`);

    expect(reject({ ...VALID, contextualExperiences: many })).toMatch(/long list/i);
  });
});

describe('availability', () => {
  it('requires an IANA timezone rather than an offset', () => {
    expect(reject({ ...VALID, availability: { timezone: 'GMT+5:30', windows: [] } })).toMatch(
      /not a timezone we recognise/i,
    );
    expect(reject({ ...VALID, availability: { timezone: 'nope', windows: [] } })).toMatch(
      /not a timezone we recognise/i,
    );
  });

  it('accepts a single-segment zone name', () => {
    const request = accept({ ...VALID, availability: { timezone: 'UTC', windows: [] } });

    expect(request.availability?.timezone).toBe('UTC');
  });

  it('rejects a window that ends before it starts', () => {
    expect(
      reject({
        ...VALID,
        availability: {
          timezone: 'Asia/Kolkata',
          windows: [{ dayOfWeek: 'MONDAY', startMinute: 1200, endMinute: 1080 }],
        },
      }),
    ).toMatch(/ends before it starts/i);
  });

  it('rejects a window that runs past the end of the day', () => {
    expect(
      reject({
        ...VALID,
        availability: {
          timezone: 'Asia/Kolkata',
          windows: [{ dayOfWeek: 'MONDAY', startMinute: 1380, endMinute: 1500 }],
        },
      }),
    ).toMatch(/past the end of the day/i);
  });

  it('rejects a day that does not exist', () => {
    expect(
      reject({
        ...VALID,
        availability: {
          timezone: 'Asia/Kolkata',
          windows: [{ dayOfWeek: 'CATURDAY', startMinute: 600, endMinute: 700 }],
        },
      }),
    ).toMatch(/day that does not exist/i);
  });

  it('rejects more windows than anyone could have meant', () => {
    const windows = Array.from({ length: 29 }, () => ({
      dayOfWeek: 'MONDAY',
      startMinute: 600,
      endMinute: 700,
    }));

    expect(reject({ ...VALID, availability: { timezone: 'Asia/Kolkata', windows } })).toMatch(
      /more availability than we can store/i,
    );
  });
});

describe('the closing note', () => {
  it('is genuinely optional', () => {
    expect(accept({ ...VALID, rawText: undefined }).rawText).toBe('');
  });

  it('has a length, because a note is not an essay', () => {
    const long = 'a'.repeat(4_001);

    expect(reject({ ...VALID, rawText: long })).toMatch(/longer than we can store/i);
    expect(accept({ ...VALID, rawText: 'a'.repeat(4_000) }).rawText).toHaveLength(4_000);
  });

  it('must be text', () => {
    expect(reject({ ...VALID, rawText: { paragraphs: [] } })).toMatch(/must be text/i);
  });
});

describe('answers that contradict each other', () => {
  it('rejects "not sure yet" together with named conversation styles', () => {
    expect(
      reject({ ...VALID, openToGuidance: true, communicationStyles: ['exploratory'] }),
    ).toMatch(/either say which conversations suit you, or that you are not sure yet/i);
  });
});

describe('bodies that are not an object', () => {
  it('are rejected without pretending to understand them', () => {
    for (const body of [null, undefined, 'a string', 42, ['an', 'array']]) {
      expect(reject(body)).toMatch(/could not be read/i);
    }
  });
});
