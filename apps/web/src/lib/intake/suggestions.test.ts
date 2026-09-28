import { describe, expect, it } from 'vitest';
import {
  applyAvailabilityHint,
  applySuggestion,
  applySuggestions,
  availabilityHintDelta,
  isAlreadyApplied,
} from './suggestions';
import { emptyDraft, describeSchedule, type IntakeDraft } from './draft';
import type { AiSuggestion, DraftField, SuggestionTarget } from '../api/ai';

/**
 * Suggestions into the draft.
 *
 * The claim these tests defend is narrow and important: **the assistant cannot invent intake
 * state.** Every assertion here is about a suggestion being applied through the draft's own
 * functions, so a suggestion can only ever produce an answer the intake already knew how to
 * hold.
 */

const draft = (): IntakeDraft => ({ ...emptyDraft(), timezone: 'Europe/Berlin' });

const suggestion = (
  key: string,
  target: SuggestionTarget,
  overrides: Partial<AiSuggestion> = {},
): AiSuggestion => ({
  category: 'area',
  key,
  confidence: 'high',
  source: 'user_message',
  explanation: 'Because you said so.',
  target,
  ...overrides,
});

/** A draft-family target, for the tests that care about the field rather than the label. */
const into = (field: DraftField): SuggestionTarget => ({ kind: 'draft', field, label: 'A label' });

describe('writing into the vocabulary families', () => {
  it('adds an area', () => {
    const result = applySuggestion(draft(), suggestion('work-stress', into('areasOfWork')));

    expect(result.ok && result.draft.areasOfWork).toEqual(['work-stress']);
  });

  it('adds a context under the draft’s own plural name', () => {
    const result = applySuggestion(draft(), suggestion('relocation', into('contextualExperiences')));

    // The vocabulary endpoint says `contextualExperience`; the draft says
    // `contextualExperiences`. The server sends the field, and this is the only place the
    // two names meet.
    expect(result.ok && result.draft.contextualExperiences).toEqual(['relocation']);
  });

  it('adds a language', () => {
    const result = applySuggestion(draft(), suggestion('hi', into('languages')));

    expect(result.ok && result.draft.languages).toEqual(['hi']);
  });

  it('adds to session formats rather than replacing them', () => {
    const start: IntakeDraft = { ...draft(), sessionFormats: ['online'] };
    const result = applySuggestion(start, suggestion('in-person', into('sessionFormats')));

    // Someone who named two formats in one sentence meant both, and a toggle here would
    // silently delete the first.
    expect(result.ok && result.draft.sessionFormats).toEqual(['online', 'in-person']);
  });

  it('does not add the same format twice', () => {
    const start: IntakeDraft = { ...draft(), sessionFormats: ['online'] };
    const result = applySuggestion(start, suggestion('online', into('sessionFormats')));

    expect(result.ok && result.draft.sessionFormats).toEqual(['online']);
  });

  it('adds a conversation style, and clears the "not sure" flag to match', () => {
    const start: IntakeDraft = { ...draft(), openToGuidance: true };
    const result = applySuggestion(start, suggestion('exploratory', into('communicationStyles')));

    // Storing both would leave the recommendation guessing which was meant, which is the
    // draft's own rule rather than one invented here.
    expect(result.ok && result.draft.communicationStyles).toEqual(['exploratory']);
    expect(result.ok && result.draft.openToGuidance).toBe(false);
  });

  it('leaves a style alone when guidance was chosen without a style to conflict with', () => {
    const start: IntakeDraft = { ...draft(), openToGuidance: true };
    const result = applySuggestion(
      start,
      suggestion('work-stress', into('areasOfWork'), { category: 'area' }),
    );

    // Choosing an area is not a statement about conversation style, so it must not clear a
    // deliberate "I am not sure yet".
    expect(result.ok && result.draft.openToGuidance).toBe(true);
  });
});

describe('the two non-vocabulary targets', () => {
  it('sets the guidance flag', () => {
    const result = applySuggestion(
      draft(),
      suggestion('open-to-guidance', { kind: 'guidance', label: 'You are not sure yet' }),
    );

    expect(result.ok && result.draft.openToGuidance).toBe(true);
  });

  it('does not write an availability hint into the draft at all', () => {
    const start = draft();
    const result = applySuggestion(
      start,
      suggestion('hint:evening:TUESDAY', {
        kind: 'availabilityHint',
        part: 'evening',
        days: ['TUESDAY'],
        label: 'Tuesdays evenings',
      }),
    );

    // Someone who said "evenings" has not told us a day, and the availability question is a
    // grid a suggestion has no business filling in. It is applied only when pressed.
    expect(result.ok && result.draft).toBe(start);
  });

  it('offers only the new part of a hint against the current draft', () => {
    const start: IntakeDraft = { ...draft(), days: ['TUESDAY'] };
    const delta = availabilityHintDelta(start, {
      kind: 'availabilityHint',
      part: 'evening',
      days: ['TUESDAY', 'THURSDAY'],
      label: 'Tuesdays, Thursdays evenings',
    });

    // Tuesday is already there, so offering it again would be noise on a page somebody is
    // already reading.
    expect(delta).toEqual({ part: 'evening', days: ['THURSDAY'] });
  });

  it('offers nothing for a hint the draft already satisfies', () => {
    const start: IntakeDraft = { ...draft(), days: ['TUESDAY'], timeOfDay: ['evening'] };

    expect(
      availabilityHintDelta(start, {
        kind: 'availabilityHint',
        part: 'evening',
        days: ['TUESDAY'],
        label: 'Tuesdays evenings',
      }),
    ).toBeNull();
  });

  it('applies a hint when it is actually chosen', () => {
    const applied = applyAvailabilityHint(draft(), {
      kind: 'availabilityHint',
      part: 'evening',
      days: ['TUESDAY'],
      label: 'Tuesdays evenings',
    });

    expect(applied.days).toEqual(['TUESDAY']);
    expect(applied.timeOfDay).toEqual(['evening']);
    // A real answer, so the schedule reads the way it would have done by hand.
    expect(describeSchedule(applied)).toMatch(/tuesday/i);
  });

  it('treats a note-only suggestion as already applied', () => {
    // It has nowhere to go, so claiming it is pending would offer a Keep button that cannot
    // do anything.
    expect(
      isAlreadyApplied(
        draft(),
        suggestion('integrative', { kind: 'note-only', label: 'Integrative' }),
      ),
    ).toBe(true);
  });
});

describe('what it refuses', () => {
  it('refuses a target kind it does not recognise', () => {
    const result = applySuggestion(
      draft(),
      suggestion('mystery', { kind: 'teleport', label: 'x' } as unknown as SuggestionTarget),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe('unknown-target');
  });

  it('refuses a draft field it does not recognise', () => {
    const result = applySuggestion(
      draft(),
      suggestion('mystery', into('moods' as never)),
    );

    expect(result.ok).toBe(false);
  });

  it('refuses a suggestion with no target at all', () => {
    const result = applySuggestion(
      draft(),
      suggestion('mystery', undefined as unknown as SuggestionTarget),
    );

    expect(result.ok === false && result.failure.kind).toBe('no-target');
  });

  it('reports every failure rather than stopping at the first', () => {
    const result = applySuggestions(draft(), [
      suggestion('work-stress', into('areasOfWork')),
      suggestion('mystery', { kind: 'teleport', label: 'x' } as unknown as SuggestionTarget),
    ]);

    // The good one still lands, and the bad one is reported. Silently dropping it would make
    // the count differ from what the person pressed.
    expect(result.draft.areasOfWork).toEqual(['work-stress']);
    expect(result.failures).toHaveLength(1);
  });
});

describe('knowing what is already there', () => {
  it('recognises a value the draft already holds', () => {
    const start: IntakeDraft = { ...draft(), areasOfWork: ['work-stress'] };

    expect(isAlreadyApplied(start, suggestion('work-stress', into('areasOfWork')))).toBe(true);
    expect(isAlreadyApplied(start, suggestion('grief-and-loss', into('areasOfWork')))).toBe(false);
  });

  it('recognises the guidance flag', () => {
    const start: IntakeDraft = { ...draft(), openToGuidance: true };

    expect(
      isAlreadyApplied(
        start,
        suggestion('open-to-guidance', { kind: 'guidance', label: 'You are not sure yet' }),
      ),
    ).toBe(true);
  });

  /**
   * This is why the `alreadyApplied` check exists at all.
   *
   * The draft's functions are toggles, which is right for a form and wrong for an approval.
   * Without this, pressing Keep on something already in the draft would *remove* it, and a
   * person who could not see that would conclude the assistant had erased an answer they
   * had agreed with.
   */
  it('stops a second Keep from removing an answer', () => {
    const start: IntakeDraft = { ...draft(), areasOfWork: ['work-stress'] };
    const kept = suggestion('work-stress', into('areasOfWork'));

    expect(isAlreadyApplied(start, kept)).toBe(true);

    const applied = applySuggestion(start, kept);
    // The interface would not call this at all; asserting it here documents *why*.
    expect(applied.ok && applied.draft.areasOfWork).toEqual([]);
  });
});
