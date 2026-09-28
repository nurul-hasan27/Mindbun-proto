import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearIntake,
  detectTimezone,
  describeTimezone,
  hasStoredDraft,
  loadDraft,
  releaseSubmissionId,
  saveDraft,
  sessionId,
  submissionId,
} from './session';
import { emptyDraft, type IntakeDraft } from './draft';

function draftWith(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
  return { ...emptyDraft(), timezone: 'Asia/Kolkata', ...overrides };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('keeping a draft', () => {
  it('starts with nothing, because a first visit has answered nothing', () => {
    expect(loadDraft()).toBeNull();
    expect(hasStoredDraft()).toBe(false);
  });

  it('returns a draft that was saved, intact', () => {
    const draft = draftWith({
      areasOfWork: ['relationships'],
      languages: ['en', 'hi'],
      rawText: 'I would rather not say much yet.',
      days: ['TUESDAY'],
      timeOfDay: ['evening'],
    });

    saveDraft(draft);

    expect(loadDraft()).toEqual(draft);
    expect(hasStoredDraft()).toBe(true);
  });

  it('survives the kind of refresh that loses everything in memory', () => {
    saveDraft(draftWith({ areasOfWork: ['burnout'], sessionFormats: ['online'] }));

    // Nothing else happens between saving and reading: this is the whole of
    // what a refresh does to a sessionStorage draft.
    const restored = loadDraft();

    expect(restored?.areasOfWork).toEqual(['burnout']);
    expect(restored?.sessionFormats).toEqual(['online']);
  });

  it('refuses a stored shape it does not understand, rather than crashing on it', () => {
    sessionStorage.setItem('wtm.intake.draft.v1', JSON.stringify({ areasOfWork: 'nope' }));
    expect(loadDraft()).toBeNull();

    sessionStorage.setItem('wtm.intake.draft.v1', 'not json at all');
    expect(loadDraft()).toBeNull();

    sessionStorage.setItem('wtm.intake.draft.v1', 'null');
    expect(loadDraft()).toBeNull();
  });

  it('refuses a stored shape that is not a draft', () => {
    sessionStorage.setItem('wtm.intake.draft.v1', JSON.stringify([1, 2, 3]));
    expect(loadDraft()).toBeNull();
  });

  it('refuses a day or a time it has never heard of', () => {
    sessionStorage.setItem(
      'wtm.intake.draft.v1',
      JSON.stringify({ ...emptyDraft(), days: ['CATURDAY'] }),
    );
    expect(loadDraft()).toBeNull();

    sessionStorage.setItem(
      'wtm.intake.draft.v1',
      JSON.stringify({ ...emptyDraft(), timeOfDay: ['midnight'] }),
    );
    expect(loadDraft()).toBeNull();
  });
});

describe('the anonymous identifiers', () => {
  it('gives one identifier per visit, and keeps it', () => {
    const first = sessionId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sessionId()).toBe(first);
  });

  it('gives one identifier per submission, and keeps it so a retry cannot duplicate', () => {
    const first = submissionId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(submissionId()).toBe(first);
  });

  it('replaces a stored identifier that is not a UUID', () => {
    sessionStorage.setItem('wtm.intake.session.v1', 'not-a-uuid');
    expect(sessionId()).not.toBe('not-a-uuid');
  });

  it('replaces a stored identifier from a different draft', () => {
    releaseSubmissionId();

    const before = submissionId();
    releaseSubmissionId();

    expect(submissionId()).not.toBe(before);
  });
});

describe('clearing', () => {
  it('removes the draft and both identifiers', () => {
    saveDraft(draftWith({ areasOfWork: ['relationships'] }));
    sessionId();
    submissionId();

    clearIntake();

    expect(hasStoredDraft()).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it('leaves the next visit with a new session', () => {
    const first = sessionId();
    clearIntake();

    expect(sessionId()).not.toBe(first);
  });
});

describe('the timezone', () => {
  it('reads one from the browser when it will give one', () => {
    const zone = detectTimezone();

    expect(zone === null || typeof zone === 'string').toBe(true);
  });

  it('describes a real zone in words rather than as an identifier', () => {
    const description = describeTimezone('Asia/Kolkata');

    expect(description).not.toBe('Asia/Kolkata');
    expect(description.length).toBeGreaterThan(0);
  });

  it('says something honest about a zone it does not know', () => {
    expect(describeTimezone('Not/AZone')).toBe('your local time');
  });
});
