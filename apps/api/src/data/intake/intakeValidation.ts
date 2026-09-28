import { isDayName } from '../dayOfWeek.js';
import { isIanaTimezone, isUuid } from '../validators.js';
import type {
  AvailabilityInput,
  AvailabilityWindowInput,
  IntakeRequest,
  IntakeVocabulary,
} from './intakeTypes.js';

/**
 * Everything the intake API will accept, decided in one place.
 *
 * The rules are written by hand rather than declared as a JSON Schema because
 * the answer to "no" must be a sentence a person can act on, not
 * `body/areasOfWork/0 must be equal to one of the allowed values`. A rejected
 * request is a bug in the client, and this file is where that bug is named.
 *
 * Two deliberate choices:
 *
 * - A value the database does not recognise is reported *without* repeating the
 *   value. Everything in a request came from a browser, and reflecting it into a
 *   response body is a habit worth not having.
 * - Only the first problem is reported. A client that shows a form can fix one
 *   message at a time; a list of eight would only be read by whoever is writing
 *   the client, and they have the stack trace.
 */

/** 7 days × 3 parts of day, with room to spare. */
const MAX_AVAILABILITY_WINDOWS = 28;
const MAX_SELECTIONS = 12;
/** Generous for a closing note, short enough to stay a note. */
const MAX_RAW_TEXT_LENGTH = 4_000;

export type IntakeValidation =
  | { readonly ok: true; readonly request: IntakeRequest }
  | { readonly ok: false; readonly message: string };

type Read<TValue> =
  { readonly ok: true; readonly value: TValue } | { readonly ok: false; readonly message: string };

const WRONG_BODY: IntakeValidation = { ok: false, message: 'The intake could not be read.' };

function ok<TValue>(value: TValue): Read<TValue> {
  return { ok: true, value };
}

function no(message: string): Read<never> {
  return { ok: false, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

interface KeyListOptions {
  /** Shown in messages, e.g. "areas of work". */
  readonly subject: string;
  /** Sentence used when the list is required and empty. */
  readonly requiredMessage: string | null;
}

function readKeyList(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
  { subject, requiredMessage }: KeyListOptions,
): Read<readonly string[]> {
  if (value === undefined || value === null) {
    return requiredMessage === null ? ok([]) : no(requiredMessage);
  }

  if (!Array.isArray(value)) {
    return no(`"${field}" must be a list.`);
  }

  if (value.length > MAX_SELECTIONS) {
    return no(`That is a long list of ${subject}. Choose a few rather than all of them.`);
  }

  if (value.length === 0 && requiredMessage !== null) {
    return no(requiredMessage);
  }

  for (const entry of value) {
    if (typeof entry !== 'string' || !allowed.has(entry)) {
      return no(`One of the ${subject} is not something we recognise.`);
    }
  }

  // Duplicates are a client's accident rather than a meaning: the set is what
  // counts, and a stable order makes a stored draft comparable with its request.
  return ok([...new Set(value as readonly string[])].sort());
}

function readBoolean(value: unknown, field: string): Read<boolean> {
  if (value === undefined || value === null) {
    return ok(false);
  }

  return typeof value === 'boolean' ? ok(value) : no(`"${field}" must be true or false.`);
}

function readRawText(value: unknown): Read<string> {
  if (value === undefined || value === null) {
    return ok('');
  }

  if (typeof value !== 'string') {
    return no('The closing note must be text.');
  }

  const trimmed = value.trim();

  return trimmed.length > MAX_RAW_TEXT_LENGTH
    ? no('The closing note is longer than we can store. A few lines is plenty.')
    : ok(trimmed);
}

function readWindow(value: unknown): Read<AvailabilityWindowInput> {
  const window = asRecord(value);

  if (window === null) {
    return no('One of the times is not something we recognise.');
  }

  const day = readTrimmedString(window['dayOfWeek']);
  const start = window['startMinute'];
  const end = window['endMinute'];

  if (day === null || !isDayName(day)) {
    return no('One of the times names a day that does not exist.');
  }

  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isInteger(start) ||
    !Number.isInteger(end)
  ) {
    return no('One of the times is not a time of day.');
  }

  if (start < 0 || end > 1440) {
    return no('One of the times runs past the end of the day.');
  }

  return start >= end
    ? no('One of the times ends before it starts.')
    : ok({ dayOfWeek: day, startMinute: start, endMinute: end });
}

function readWindows(value: unknown): Read<readonly AvailabilityWindowInput[]> {
  if (value === undefined || value === null) {
    return ok([]);
  }

  if (!Array.isArray(value)) {
    return no('The list of times is not a list we understand.');
  }

  if (value.length > MAX_AVAILABILITY_WINDOWS) {
    return no('That is more availability than we can store.');
  }

  const windows: AvailabilityWindowInput[] = [];

  for (const entry of value) {
    const window = readWindow(entry);

    if (!window.ok) {
      return window;
    }

    windows.push(window.value);
  }

  return ok(windows);
}

function readAvailability(value: unknown): Read<AvailabilityInput | null> {
  if (value === undefined || value === null) {
    return ok(null);
  }

  const availability = asRecord(value);

  if (availability === null) {
    return no('The availability must be an object.');
  }

  const timezone = readTrimmedString(availability['timezone']);

  if (timezone === null) {
    return no('We could not tell which timezone these times are in.');
  }

  if (!isIanaTimezone(timezone)) {
    return no('That is not a timezone we recognise.');
  }

  const windows = readWindows(availability['windows']);

  return windows.ok ? ok({ timezone, windows: windows.value }) : windows;
}

function setOf(options: readonly { key: string }[]): ReadonlySet<string> {
  return new Set(options.map((option) => option.key));
}

function setOfCodes(options: readonly { code: string }[]): ReadonlySet<string> {
  return new Set(options.map((option) => option.code));
}

/**
 * Checks a request body against the vocabulary the database actually holds.
 *
 * Returns the request in a shape the repository can store without further
 * thought, or one sentence explaining the first thing that is wrong.
 */
export function validateIntakeRequest(
  body: unknown,
  vocabulary: IntakeVocabulary,
): IntakeValidation {
  const record = asRecord(body);

  if (record === null) {
    return WRONG_BODY;
  }

  const sessionId = readTrimmedString(record['sessionId']);

  if (sessionId === null || !isUuid(sessionId)) {
    return { ok: false, message: 'The session identifier must be a UUID.' };
  }

  const submissionId = readTrimmedString(record['submissionId']);

  if (submissionId === null || !isUuid(submissionId)) {
    return { ok: false, message: 'The submission identifier must be a UUID.' };
  }

  const areas = readKeyList(record['areasOfWork'], 'areasOfWork', setOf(vocabulary.areasOfWork), {
    subject: 'areas of work',
    requiredMessage: null,
  });
  const styles = readKeyList(
    record['communicationStyles'],
    'communicationStyles',
    setOf(vocabulary.communicationStyles),
    { subject: 'conversation styles', requiredMessage: null },
  );
  const contexts = readKeyList(
    record['contextualExperiences'],
    'contextualExperiences',
    setOf(vocabulary.contextualExperience),
    { subject: 'contexts', requiredMessage: null },
  );
  const languages = readKeyList(
    record['languages'],
    'languages',
    setOfCodes(vocabulary.languages),
    {
      subject: 'languages',
      requiredMessage: 'Choose at least one language you would be comfortable speaking.',
    },
  );
  const formats = readKeyList(
    record['sessionFormats'],
    'sessionFormats',
    setOf(vocabulary.sessionFormats),
    {
      subject: 'session formats',
      requiredMessage: 'Let us know how you would like to meet, even if the answer is either.',
    },
  );
  const guidance = readBoolean(record['openToGuidance'], 'openToGuidance');
  const availability = readAvailability(record['availability']);
  const rawText = readRawText(record['rawText']);

  const firstProblem = [
    areas,
    styles,
    contexts,
    languages,
    formats,
    guidance,
    availability,
    rawText,
  ]
    .filter((result) => !result.ok)
    .map((result) => (result as { ok: false; message: string }).message)[0];

  if (firstProblem !== undefined) {
    return { ok: false, message: firstProblem };
  }

  // Narrowed by the check above; these are the same reads, not new ones.
  const areasValue = (areas as { ok: true; value: readonly string[] }).value;
  const stylesValue = (styles as { ok: true; value: readonly string[] }).value;
  const contextsValue = (contexts as { ok: true; value: readonly string[] }).value;
  const languagesValue = (languages as { ok: true; value: readonly string[] }).value;
  const formatsValue = (formats as { ok: true; value: readonly string[] }).value;
  const guidanceValue = (guidance as { ok: true; value: boolean }).value;
  const availabilityValue = (availability as { ok: true; value: AvailabilityInput | null }).value;
  const rawTextValue = (rawText as { ok: true; value: string }).value;

  // "Not sure yet" and "here is what I want" are different answers, and storing
  // both at once would leave a future recommendation guessing which was meant.
  if (guidanceValue && stylesValue.length > 0) {
    return {
      ok: false,
      message: 'Either say which conversations suit you, or that you are not sure yet.',
    };
  }

  // An intake with nothing in it is not an intake. Someone who chose "something
  // else" has still told us something, in their own words.
  if (areasValue.length === 0 && rawTextValue === '') {
    return {
      ok: false,
      message: 'Tell us what you would like support with, or add a line in your own words.',
    };
  }

  return {
    ok: true,
    request: {
      sessionId,
      submissionId,
      areasOfWork: areasValue,
      communicationStyles: stylesValue,
      contextualExperiences: contextsValue,
      languages: languagesValue,
      sessionFormats: formatsValue,
      availability: availabilityValue,
      openToGuidance: guidanceValue,
      rawText: rawTextValue,
    },
  };
}
