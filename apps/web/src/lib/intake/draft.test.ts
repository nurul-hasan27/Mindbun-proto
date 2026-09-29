import { describe, expect, it } from 'vitest';
import {
  DAY_LABELS,
  emptyDraft,
  availabilityWindows,
  describeSchedule,
  draftGaps,
  isDraftComplete,
  reconcileDraft,
  setOpenToGuidance,
  setRawText,
  setSessionFormats,
  toPayload,
  toggleArea,
  toggleCommunicationStyle,
  toggleContext,
  toggleDay,
  toggleLanguage,
  toggleTimeOfDay,
  type IntakeDraft,
} from './draft';
import type { IntakeVocabulary } from '../api/types';

const VOCABULARY: IntakeVocabulary = {
  areasOfWork: [
    { key: 'relationships', name: 'Relationships' },
    { key: 'burnout', name: 'Burnout' },
  ],
  communicationStyles: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
  ],
  contextualExperience: [
    { key: 'relocation', name: 'Relocation' },
    { key: 'indian-diaspora', name: 'Indian diaspora' },
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

const IDS = { sessionId: 'session-1', submissionId: 'submission-1' };

describe('a new draft', () => {
  it('has answered nothing', () => {
    const draft = emptyDraft();

    expect(draft.areasOfWork).toEqual([]);
    expect(draft.communicationStyles).toEqual([]);
    expect(draft.openToGuidance).toBe(false);
    expect(draft.contextualExperiences).toEqual([]);
    expect(draft.languages).toEqual([]);
    expect(draft.sessionFormats).toEqual([]);
    expect(draft.timezone).toBeNull();
    expect(draft.days).toEqual([]);
    expect(draft.timeOfDay).toEqual([]);
    expect(draft.rawText).toBe('');
  });
});

describe('choosing one thing and then another', () => {
  it('adds a second answer without losing the first', () => {
    const draft = toggleArea(toggleArea(emptyDraft(), 'relationships'), 'burnout');

    expect(draft.areasOfWork).toEqual(['relationships', 'burnout']);
  });

  it('takes an answer back when it is chosen twice', () => {
    const draft = toggleArea(toggleArea(emptyDraft(), 'relationships'), 'relationships');

    expect(draft.areasOfWork).toEqual([]);
  });

  it('never mutates the draft it was given', () => {
    const original = emptyDraft();
    toggleArea(original, 'relationships');

    expect(original.areasOfWork).toEqual([]);
  });

  it('toggles days, languages, contexts and styles the same way', () => {
    let draft = emptyDraft();
    draft = toggleDay(draft, 'TUESDAY');
    draft = toggleLanguage(draft, 'en');
    draft = toggleContext(draft, 'relocation');
    draft = toggleCommunicationStyle(draft, 'exploratory');
    draft = toggleTimeOfDay(draft, 'evening');

    expect(draft.days).toEqual(['TUESDAY']);
    expect(draft.languages).toEqual(['en']);
    expect(draft.contextualExperiences).toEqual(['relocation']);
    expect(draft.communicationStyles).toEqual(['exploratory']);
    expect(draft.timeOfDay).toEqual(['evening']);
  });
});

describe('"I’m not sure yet"', () => {
  it('clears any named styles, because both answers cannot be true at once', () => {
    const draft = setOpenToGuidance(toggleCommunicationStyle(emptyDraft(), 'exploratory'), true);

    expect(draft.openToGuidance).toBe(true);
    expect(draft.communicationStyles).toEqual([]);
  });

  it('is taken back when a style is named instead', () => {
    const draft = toggleCommunicationStyle(setOpenToGuidance(emptyDraft(), true), 'exploratory');

    expect(draft.openToGuidance).toBe(false);
    expect(draft.communicationStyles).toEqual(['exploratory']);
  });
});

describe('"either is fine"', () => {
  it('records both formats, so it is not confused with skipping the question', () => {
    const draft = setSessionFormats(emptyDraft(), ['in-person', 'online']);

    expect(draft.sessionFormats).toEqual(['in-person', 'online']);
  });
});

describe('the closing note', () => {
  it('is stored as typed, and trimmed only when it is sent', () => {
    const draft = setRawText(emptyDraft(), '  I have a lot on.  ');

    expect(draft.rawText).toBe('  I have a lot on.  ');
    expect(toPayload(draft, IDS).rawText).toBe('I have a lot on.');
  });
});

describe('describing a schedule in words', () => {
  it('recognises weekdays and evenings', () => {
    let draft = emptyDraft();
    draft = { ...draft, days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] };
    draft = toggleTimeOfDay(draft, 'evening');

    expect(describeSchedule(draft)).toBe('weekday evenings');
    // Adding a weekend day to a full week is no longer "weekdays".
    expect(describeSchedule(toggleDay(draft, 'SATURDAY'))).toBe(
      'Monday, Tuesday, Wednesday, Thursday, Friday and Saturday evenings',
    );
  });

  it('says both parts when more than one is chosen', () => {
    let draft = toggleDay(emptyDraft(), 'SATURDAY');
    draft = toggleDay(draft, 'SUNDAY');
    draft = toggleTimeOfDay(draft, 'morning');
    draft = toggleTimeOfDay(draft, 'evening');

    expect(describeSchedule(draft)).toBe('weekend mornings or evenings');
  });

  it('names the days when the week is unusual', () => {
    let draft = toggleDay(emptyDraft(), 'WEDNESDAY');
    draft = toggleDay(draft, 'SATURDAY');
    draft = toggleTimeOfDay(draft, 'evening');

    expect(describeSchedule(draft)).toBe('Wednesday and Saturday evenings');
  });

  it('has nothing to say about a half-answered week', () => {
    expect(describeSchedule(emptyDraft())).toBeNull();
    expect(describeSchedule(toggleDay(emptyDraft(), 'MONDAY'))).toBeNull();
    expect(describeSchedule(toggleTimeOfDay(emptyDraft(), 'evening'))).toBeNull();
  });

  it('names every day of the week', () => {
    for (const day of Object.keys(DAY_LABELS)) {
      expect(DAY_LABELS[day as keyof typeof DAY_LABELS]).toMatch(/s$/);
    }
  });
});

describe('turning a rough sense of a week into windows', () => {
  it('is empty unless a timezone, days and parts are all present', () => {
    const withDays = toggleTimeOfDay(toggleDay(emptyDraft(), 'TUESDAY'), 'evening');

    expect(availabilityWindows(withDays)).toEqual([]);

    const withDaysAndZone = { ...withDays, timezone: 'Asia/Kolkata' };
    expect(availabilityWindows(withDaysAndZone)).toHaveLength(1);
  });

  it('crosses days with parts, because that is what was asked for', () => {
    let draft: IntakeDraft = { ...emptyDraft(), timezone: 'Europe/London' };
    draft = toggleDay(draft, 'MONDAY');
    draft = toggleDay(draft, 'THURSDAY');
    draft = toggleTimeOfDay(draft, 'morning');
    draft = toggleTimeOfDay(draft, 'evening');

    const windows = availabilityWindows(draft);

    expect(windows).toHaveLength(4);
    expect(windows).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 'MONDAY', startMinute: 480, endMinute: 720 },
        { dayOfWeek: 'MONDAY', startMinute: 1020, endMinute: 1260 },
        { dayOfWeek: 'THURSDAY', startMinute: 480, endMinute: 720 },
        { dayOfWeek: 'THURSDAY', startMinute: 1020, endMinute: 1260 },
      ]),
    );
  });
});

describe('what a future recommendation would still be missing', () => {
  it('names the four answers it cannot do without', () => {
    const gaps = draftGaps(emptyDraft());

    expect(gaps.areasOrWords).toBe(false);
    expect(gaps.conversation).toBe(false);
    expect(gaps.language).toBe(false);
    expect(gaps.sessionFormat).toBe(false);
    expect(isDraftComplete(emptyDraft())).toBe(false);
  });

  it('accepts an intake that is only a note in someone own words', () => {
    const draft = setRawText(emptyDraft(), 'I am not sure where to begin.');

    expect(draftGaps(draft).areasOrWords).toBe(true);
  });

  it('does not require context, availability or the note', () => {
    let draft = toggleArea(emptyDraft(), 'relationships');
    draft = setOpenToGuidance(draft, true);
    draft = toggleLanguage(draft, 'en');
    draft = setSessionFormats(draft, ['online']);

    expect(isDraftComplete(draft)).toBe(true);
  });
});

describe('the request', () => {
  it('carries the identifiers it is given, unchanged', () => {
    const payload = toPayload(emptyDraft(), IDS);

    expect(payload.sessionId).toBe('session-1');
    expect(payload.submissionId).toBe('submission-1');
  });

  it('sorts every list, so the same answers always send the same request', () => {
    let draft = toggleArea(emptyDraft(), 'burnout');
    draft = toggleArea(draft, 'relationships');
    draft = toggleLanguage(draft, 'hi');
    draft = toggleLanguage(draft, 'en');

    const payload = toPayload(draft, IDS);

    expect(payload.areasOfWork).toEqual(['burnout', 'relationships']);
    expect(payload.languages).toEqual(['en', 'hi']);
  });

  it('sends no availability rather than an empty one', () => {
    expect(toPayload(emptyDraft(), IDS).availability).toBeNull();
  });

  it('sends the timezone and the windows together, or neither', () => {
    const draft: IntakeDraft = {
      ...toggleDay(emptyDraft(), 'TUESDAY'),
      timezone: 'Asia/Kolkata',
      timeOfDay: ['evening'],
    };

    const payload = toPayload(draft, IDS);

    expect(payload.availability?.timezone).toBe('Asia/Kolkata');
    expect(payload.availability?.windows).toEqual([
      { dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 },
    ]);
  });

  it('sends the note even when it is the only answer', () => {
    const payload = toPayload(setRawText(emptyDraft(), 'Here is what is going on.'), IDS);

    expect(payload.rawText).toBe('Here is what is going on.');
    expect(payload.areasOfWork).toEqual([]);
  });
});

describe('a vocabulary that has changed under a saved draft', () => {
  it('drops answers the database no longer has', () => {
    const stale = toggleArea(toggleLanguage(emptyDraft(), 'en'), 'relationships');

    const reconciled = reconcileDraft(
      { ...stale, timezone: 'Asia/Kolkata', sessionFormats: ['online'] },
      { ...VOCABULARY, sessionFormats: [] },
    );

    expect(reconciled.sessionFormats).toEqual([]);
    // These are still real, so they stay.
    expect(reconciled.areasOfWork).toEqual(['relationships']);
    expect(reconciled.languages).toEqual(['en']);
  });

  it('leaves a draft alone when everything it says is still true', () => {
    const draft = toggleArea(emptyDraft(), 'relationships');

    expect(reconcileDraft(draft, VOCABULARY)).toEqual(draft);
  });
});
