import { isIanaTimezone } from '../validators.js';

/**
 * Validation for a therapist profile at the moment it is written.
 *
 * PostgreSQL will happily store an empty biography or an availability window
 * that ends before it starts, and Prisma does not model CHECK constraints.
 * Rather than hand-writing SQL into a migration (which creates drift on the next
 * `migrate dev`), the rules live here — in the one place profiles are created —
 * and are covered by tests that need no database.
 *
 * See docs/domain-model.md for why these particular fields carry rules.
 */

export interface ProfileDraft {
  readonly displayName: string;
  readonly headline: string;
  readonly bio: string;
  readonly location: string;
  /** IANA zone name, e.g. "Asia/Kolkata". */
  readonly timezone: string;
  readonly yearsOfExperience: number;
  readonly availability: readonly {
    readonly dayOfWeek: string;
    readonly startMinute: number;
    readonly endMinute: number;
  }[];
}

const MINIMUM_BIO_LENGTH = 40;
const MINIMUM_HEADLINE_LENGTH = 8;
const MINIMUM_YEARS = 0;
const MAXIMUM_YEARS = 70;
const DAY_NAMES = new Set([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export class InvalidProfileDraftError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid therapist profile:\n- ${problems.join('\n- ')}`);
    this.name = 'InvalidProfileDraftError';
  }
}

export function validateProfileDraft(draft: ProfileDraft): string[] {
  const problems: string[] = [];

  if (draft.displayName.trim().length < 2) {
    problems.push('displayName must be at least two characters.');
  }

  if (draft.headline.trim().length < MINIMUM_HEADLINE_LENGTH) {
    problems.push(`headline must be at least ${MINIMUM_HEADLINE_LENGTH} characters.`);
  }

  if (draft.bio.trim().length < MINIMUM_BIO_LENGTH) {
    problems.push(`bio must be at least ${MINIMUM_BIO_LENGTH} characters.`);
  }

  if (draft.location.trim().length === 0) {
    problems.push('location must not be empty.');
  }

  if (!isIanaTimezone(draft.timezone)) {
    problems.push(`timezone "${draft.timezone}" is not an IANA zone name.`);
  }

  if (
    !Number.isInteger(draft.yearsOfExperience) ||
    draft.yearsOfExperience < MINIMUM_YEARS ||
    draft.yearsOfExperience > MAXIMUM_YEARS
  ) {
    problems.push(
      `yearsOfExperience must be a whole number between ${MINIMUM_YEARS} and ${MAXIMUM_YEARS}.`,
    );
  }

  problems.push(...validateWindows(draft.availability));

  return problems;
}

/** Throws `InvalidProfileDraftError` when the draft cannot be stored. */
export function assertValidProfileDraft(draft: ProfileDraft): void {
  const problems = validateProfileDraft(draft);

  if (problems.length > 0) {
    throw new InvalidProfileDraftError(problems);
  }
}

function validateWindows(windows: ProfileDraft['availability']): string[] {
  const problems: string[] = [];
  const seenDays = new Set<string>();

  for (const window of windows) {
    const label = `${window.dayOfWeek} ${window.startMinute}–${window.endMinute}`;

    if (!DAY_NAMES.has(window.dayOfWeek)) {
      problems.push(`${label}: unknown day of week.`);
      continue;
    }

    if (window.startMinute < 0 || window.endMinute > 1440) {
      problems.push(`${label}: times must fall within a single day.`);
      continue;
    }

    if (window.startMinute >= window.endMinute) {
      problems.push(`${label}: a window must end after it starts.`);
      continue;
    }

    if (seenDays.has(window.dayOfWeek)) {
      problems.push(`${label}: two windows start on the same day.`);
    }
    seenDays.add(window.dayOfWeek);
  }

  return problems;
}
