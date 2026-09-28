import type {
  AvailabilityWindowView,
  DayName,
  IntakeDraftPayload,
  IntakeVocabulary,
} from '../api/types';

/**
 * The draft: everything someone has told us so far, in the words they used.
 *
 * Two rules shaped this file.
 *
 * 1. **Vocabulary keys, never display names.** The questions are phrased in
 *    human language and those phrases map to keys in `questions.ts`. A key is
 *    what the database joins against and what travels over the wire; a label is
 *    what a person reads. Storing labels in state would mean a copy change
 *    invalidating someone's answers.
 *
 * 2. **A draft is a value, not a bag of setters.** Every edit returns a new
 *    object, so "has this changed?" is a comparison rather than a subscription,
 *    and a refresh restores something that is structurally identical to what was
 *    saved.
 */

export interface IntakeDraft {
  /** AreaOfWork keys — what someone wants support with. */
  readonly areasOfWork: readonly string[];
  /** CommunicationStyle keys — the kind of conversation that helps. */
  readonly communicationStyles: readonly string[];
  /** True when the person said they are not yet sure about the above. */
  readonly openToGuidance: boolean;
  /** ContextualExperience keys — familiarity that matters to them. */
  readonly contextualExperiences: readonly string[];
  /** Language codes. */
  readonly languages: readonly string[];
  /** SessionFormat keys. */
  readonly sessionFormats: readonly string[];
  /** The timezone their times are in, as the browser reported it. */
  readonly timezone: string | null;
  /** Days they are usually free. */
  readonly days: readonly DayName[];
  /** Which parts of those days suit them. */
  readonly timeOfDay: readonly TimeOfDay[];
  /** Their own words. Never analysed, never logged, never sent anywhere else. */
  readonly rawText: string;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Mornings',
  afternoon: 'Afternoons',
  evening: 'Evenings',
};

/** A person choosing "evenings" has not told us a time, so the API gets a range. */
export const TIME_OF_DAY_RANGES: Record<TimeOfDay, readonly [number, number]> = {
  morning: [8 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 21 * 60],
};

export const DAY_LABELS: Record<DayName, string> = {
  MONDAY: 'Mondays',
  TUESDAY: 'Tuesdays',
  WEDNESDAY: 'Wednesdays',
  THURSDAY: 'Thursdays',
  FRIDAY: 'Fridays',
  SATURDAY: 'Saturdays',
  SUNDAY: 'Sundays',
};

export const WEEKDAYS: readonly DayName[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

export const WEEKEND_DAYS: readonly DayName[] = ['SATURDAY', 'SUNDAY'];

export function emptyDraft(): IntakeDraft {
  return {
    areasOfWork: [],
    communicationStyles: [],
    openToGuidance: false,
    contextualExperiences: [],
    languages: [],
    sessionFormats: [],
    timezone: null,
    days: [],
    timeOfDay: [],
    rawText: '',
  };
}

/** Adds or removes a value, preserving nothing about order. */
function toggle<TValue>(values: readonly TValue[], value: TValue): readonly TValue[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function toggleArea(draft: IntakeDraft, key: string): IntakeDraft {
  return { ...draft, areasOfWork: toggle(draft.areasOfWork, key) };
}

export function toggleContext(draft: IntakeDraft, key: string): IntakeDraft {
  return { ...draft, contextualExperiences: toggle(draft.contextualExperiences, key) };
}

export function toggleLanguage(draft: IntakeDraft, code: string): IntakeDraft {
  return { ...draft, languages: toggle(draft.languages, code) };
}

export function toggleDay(draft: IntakeDraft, day: DayName): IntakeDraft {
  return { ...draft, days: toggle(draft.days, day) };
}

export function toggleTimeOfDay(draft: IntakeDraft, part: TimeOfDay): IntakeDraft {
  return { ...draft, timeOfDay: toggle(draft.timeOfDay, part) };
}

/**
 * Conversation style is a single set, and "I'm not sure yet" is a separate
 * answer rather than an absence of one. Choosing it clears the list, and naming
 * a style clears the flag, because storing both would leave a future
 * recommendation guessing which was meant.
 */
export function setOpenToGuidance(draft: IntakeDraft, openToGuidance: boolean): IntakeDraft {
  return openToGuidance
    ? { ...draft, openToGuidance: true, communicationStyles: [] }
    : { ...draft, openToGuidance: false };
}

export function toggleCommunicationStyle(draft: IntakeDraft, key: string): IntakeDraft {
  return {
    ...draft,
    openToGuidance: false,
    communicationStyles: toggle(draft.communicationStyles, key),
  };
}

export function setSessionFormats(draft: IntakeDraft, keys: readonly string[]): IntakeDraft {
  return { ...draft, sessionFormats: [...keys] };
}

export function setTimezone(draft: IntakeDraft, timezone: string | null): IntakeDraft {
  return { ...draft, timezone };
}

export function setRawText(draft: IntakeDraft, rawText: string): IntakeDraft {
  return { ...draft, rawText };
}
/**
 * "weekday evenings" · "Tuesday evenings" · "Wednesdays and Saturdays mornings
 * or evenings"
 *
 * The parts of the day stay plural on purpose: they describe a recurring habit,
 * which is what the answer actually is.
 */
const TIME_OF_DAY_PHRASE: Record<TimeOfDay, string> = {
  morning: 'mornings',
  afternoon: 'afternoons',
  evening: 'evenings',
};

/**
 * Singular, because these words modify the parts of the day rather than standing
 * on their own: "Wednesday and Friday evenings", not "Wednesdays and Fridays
 * evenings".
 */
const DAY_PHRASE: Record<DayName, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

function weekdayPattern(days: readonly DayName[], all: readonly DayName[]): boolean {
  return days.length === all.length && all.every((day) => days.includes(day));
}

/** Joins a list the way a person says it: "a", "a and b", "a, b and c". */
function joinWords(words: readonly string[]): string {
  const last = words[words.length - 1];

  if (words.length <= 1 || last === undefined) {
    return last ?? '';
  }

  return `${words.slice(0, -1).join(', ')} and ${last}`;
}

function describeDays(draft: IntakeDraft): string {
  if (draft.days.length === 7) {
    return 'any day';
  }

  if (weekdayPattern(draft.days, WEEKDAYS)) {
    return 'weekday';
  }

  if (weekdayPattern(draft.days, WEEKEND_DAYS)) {
    return 'weekend';
  }

  return joinWords(draft.days.map((day) => DAY_PHRASE[day]));
}

/** "Weekday evenings", for the review screen — and null when there is nothing yet. */
export function describeSchedule(draft: IntakeDraft): string | null {
  if (draft.days.length === 0 || draft.timeOfDay.length === 0) {
    return null;
  }

  const last = draft.timeOfDay[draft.timeOfDay.length - 1];

  if (last === undefined) {
    return null;
  }

  const earlier = draft.timeOfDay.slice(0, -1).map((part) => TIME_OF_DAY_PHRASE[part]);
  const parts =
    earlier.length === 0
      ? TIME_OF_DAY_PHRASE[last]
      : `${joinWords(earlier)} or ${TIME_OF_DAY_PHRASE[last]}`;

  return `${describeDays(draft)} ${parts}`;
}

export function availabilityWindows(draft: IntakeDraft): readonly AvailabilityWindowView[] {
  if (draft.timezone === null || draft.days.length === 0 || draft.timeOfDay.length === 0) {
    return [];
  }

  return draft.days.flatMap((day) =>
    draft.timeOfDay.map((part) => {
      const [startMinute, endMinute] = TIME_OF_DAY_RANGES[part];
      return { dayOfWeek: day, startMinute, endMinute };
    }),
  );
}

/** Drops any answer the current vocabulary no longer contains. */
export function reconcileDraft(draft: IntakeDraft, vocabulary: IntakeVocabulary): IntakeDraft {
  const areas = new Set(vocabulary.areasOfWork.map((option) => option.key));
  const styles = new Set(vocabulary.communicationStyles.map((option) => option.key));
  const contexts = new Set(vocabulary.contextualExperience.map((option) => option.key));
  const languages = new Set(vocabulary.languages.map((option) => option.code));
  const formats = new Set(vocabulary.sessionFormats.map((option) => option.key));

  return {
    ...draft,
    areasOfWork: draft.areasOfWork.filter((key) => areas.has(key)),
    communicationStyles: draft.communicationStyles.filter((key) => styles.has(key)),
    contextualExperiences: draft.contextualExperiences.filter((key) => contexts.has(key)),
    languages: draft.languages.filter((code) => languages.has(code)),
    sessionFormats: draft.sessionFormats.filter((key) => formats.has(key)),
  };
}

/**
 * The request.
 *
 * `sessionId` and `submissionId` are supplied by the caller because they must be
 * stable: one per visit, and one per draft, so that a retry cannot store the
 * same answers twice.
 */
export function toPayload(
  draft: IntakeDraft,
  ids: { readonly sessionId: string; readonly submissionId: string },
): IntakeDraftPayload {
  const windows = availabilityWindows(draft);

  return {
    sessionId: ids.sessionId,
    submissionId: ids.submissionId,
    areasOfWork: [...draft.areasOfWork].sort(),
    communicationStyles: [...draft.communicationStyles].sort(),
    contextualExperiences: [...draft.contextualExperiences].sort(),
    languages: [...draft.languages].sort(),
    sessionFormats: [...draft.sessionFormats].sort(),
    availability:
      draft.timezone !== null && windows.length > 0 ? { timezone: draft.timezone, windows } : null,
    openToGuidance: draft.openToGuidance,
    rawText: draft.rawText.trim(),
  };
}

/**
 * What someone still has to answer.
 *
 * The rules are the minimum for a recommendation to be explainable: something to
 * work on, a language, and a way of meeting. Everything else may be left alone.
 */
export interface DraftGaps {
  readonly areasOrWords: boolean;
  readonly conversation: boolean;
  readonly language: boolean;
  readonly sessionFormat: boolean;
}

export function draftGaps(draft: IntakeDraft): DraftGaps {
  return {
    areasOrWords: draft.areasOfWork.length > 0 || draft.rawText.trim() !== '',
    conversation: draft.openToGuidance || draft.communicationStyles.length > 0,
    language: draft.languages.length > 0,
    sessionFormat: draft.sessionFormats.length > 0,
  };
}

export function isDraftComplete(draft: IntakeDraft): boolean {
  const gaps = draftGaps(draft);

  return gaps.areasOrWords && gaps.conversation && gaps.language && gaps.sessionFormat;
}
