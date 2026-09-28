import type { IntakeDraft, TimeOfDay } from './draft';
import type { DayName } from '../api/types';

/**
 * Where an unfinished intake lives between visits.
 *
 * **sessionStorage, deliberately.** A refresh should not throw away what someone
 * typed, but neither should a draft outlive the tab they typed it in: closing
 * the tab ends it. localStorage would keep someone's own words about their
 * mental health on a shared machine indefinitely, which is the opposite of what
 * this product is arguing for.
 *
 * What is stored is a draft and two anonymous identifiers. The raw text is
 * included — losing it on refresh would be worse — and is removed the moment the
 * intake is sent, or when someone starts again.
 */

const DRAFT_KEY = 'wtm.intake.draft.v1';
const SESSION_KEY = 'wtm.intake.session.v1';
const SUBMISSION_KEY = 'wtm.intake.submission.v1';
const RECEIPT_KEY = 'wtm.intake.receipt.v1';

/**
 * Storage can refuse: a private window, a full quota, a browser policy. Nothing
 * here may ever break the intake because of that.
 */
function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // A draft that cannot be saved is still a draft that works in this tab.
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to do: the value is not there to begin with.
  }
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const DAYS: readonly DayName[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const TIMES: readonly TimeOfDay[] = ['morning', 'afternoon', 'evening'];

/**
 * Restores a saved draft, keeping only values that are still valid.
 *
 * Validation matters because storage is not ours: it can be edited, it can hold
 * something from an older version of this prototype, and a shape that no longer
 * fits would otherwise crash the first question someone sees.
 */
export function loadDraft(): IntakeDraft | null {
  const stored = read(DRAFT_KEY);

  if (stored === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: IntakeDraft): void {
  write(DRAFT_KEY, JSON.stringify(draft));
}

/** Removes the draft, both identifiers, and the receipt. The end of someone's answers here. */
export function clearIntake(): void {
  remove(DRAFT_KEY);
  remove(SESSION_KEY);
  remove(SUBMISSION_KEY);
  remove(RECEIPT_KEY);
}

/**
 * The reference to what was stored, so the recommendation can be asked for.
 *
 * Not part of the draft, and deliberately kept after the draft is cleared. The
 * answers have left the browser; a receipt is not an answer, and the recommendation
 * is a separate step that needs something to point at — including after a refresh,
 * which is exactly when a person is most likely to come back to it.
 *
 * It holds an identifier and a timestamp. No answer, no words, nothing anyone
 * wrote.
 */
export interface IntakeReceipt {
  readonly intakeId: string;
  readonly receivedAt: string;
}

export function saveReceipt(receipt: IntakeReceipt): void {
  write(RECEIPT_KEY, JSON.stringify(receipt));
}

/** The stored receipt, or null when nothing has been submitted in this tab. */
export function loadReceipt(): IntakeReceipt | null {
  const stored = read(RECEIPT_KEY);

  if (stored === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const { intakeId, receivedAt } = parsed as Partial<IntakeReceipt>;

    if (typeof intakeId !== 'string' || typeof receivedAt !== 'string') {
      return null;
    }

    return isUuid(intakeId) ? { intakeId, receivedAt } : null;
  } catch {
    return null;
  }
}

export function clearReceipt(): void {
  remove(RECEIPT_KEY);
}

export function hasStoredDraft(): boolean {
  return read(DRAFT_KEY) !== null;
}

/**
 * One identifier per visit, so a second intake from the same person joins the
 * same anonymous client rather than creating another.
 */
export function sessionId(): string {
  const stored = read(SESSION_KEY);

  if (stored !== null && isUuid(stored)) {
    return stored;
  }

  const created = uuid();
  write(SESSION_KEY, created);

  return created;
}

/**
 * One identifier per draft, so retrying a submission cannot store it twice.
 *
 * It is minted once and kept until the intake succeeds, which is what makes
 * "Try again" safe.
 */
export function submissionId(): string {
  const stored = read(SUBMISSION_KEY);

  if (stored !== null && isUuid(stored)) {
    return stored;
  }

  const created = uuid();
  write(SUBMISSION_KEY, created);

  return created;
}

/** Called after a successful send, so a new intake gets a new identifier. */
export function releaseSubmissionId(): void {
  remove(SUBMISSION_KEY);
}

function isDraft(value: unknown): value is IntakeDraft {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<IntakeDraft>;

  return (
    Array.isArray(candidate.areasOfWork) &&
    Array.isArray(candidate.communicationStyles) &&
    typeof candidate.openToGuidance === 'boolean' &&
    Array.isArray(candidate.contextualExperiences) &&
    Array.isArray(candidate.languages) &&
    Array.isArray(candidate.sessionFormats) &&
    (candidate.timezone === null || typeof candidate.timezone === 'string') &&
    Array.isArray(candidate.days) &&
    candidate.days.every((day) => DAYS.includes(day as DayName)) &&
    Array.isArray(candidate.timeOfDay) &&
    candidate.timeOfDay.every((part: unknown) => TIMES.includes(part as TimeOfDay)) &&
    typeof candidate.rawText === 'string'
  );
}

/**
 * The browser's own timezone, as an IANA name, or `null` when it will not say.
 *
 * People never see this string; it is stored, and the questions speak in words.
 */
export function detectTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return typeof zone === 'string' && zone !== '' ? zone : null;
  } catch {
    return null;
  }
}

/**
 * A timezone in words: "GMT+5:30, India Standard Time".
 *
 * The identifier is the truth we store, and the words are what a person can act
 * on. Showing both is more honest than either alone.
 */
export function describeTimezone(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());

    const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    const name = describeZoneName(zone);

    return name === '' ? offset : `${offset}, ${name}`;
  } catch {
    return 'your local time';
  }
}

function describeZoneName(zone: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'long' })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
}
