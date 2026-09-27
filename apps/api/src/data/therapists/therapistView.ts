/**
 * The therapist shapes the API speaks.
 *
 * Prisma's generated row types stop here. Routes, schemas and tests use these
 * plain interfaces instead, so the database can be reshaped without the HTTP
 * contract moving underneath anyone.
 */

export interface AttributeView {
  /** Stable key, e.g. "reflective". Safe to use in filters and in copy. */
  readonly key: string;
  readonly name: string;
}

export type DayName =
  'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface AvailabilityWindowView {
  readonly dayOfWeek: DayName;
  /** Minutes from local midnight, e.g. 1080 for 18:00. */
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Enough to recognise someone in a list, and to see why they might fit. */
export interface TherapistSummary {
  readonly id: string;
  readonly displayName: string;
  readonly headline: string;
  readonly location: string;
  /** IANA zone, e.g. "Asia/Kolkata". */
  readonly timezone: string;
  readonly yearsOfExperience: number;
  readonly languages: readonly AttributeView[];
  readonly areasOfWork: readonly AttributeView[];
  readonly communicationStyles: readonly AttributeView[];
}

/** The full profile, including everything only one person needs to see. */
export interface TherapistProfileView extends TherapistSummary {
  readonly bio: string;
  readonly approaches: readonly AttributeView[];
  readonly contextualExperience: readonly AttributeView[];
  readonly sessionFormats: readonly AttributeView[];
  readonly availability: readonly AvailabilityWindowView[];
}

export interface TherapistListQuery {
  readonly take: number;
  readonly skip: number;
  /** ISO 639-1 code, e.g. "hi". */
  readonly language?: string;
  /** An area-of-work key, e.g. "career-transitions". */
  readonly area?: string;
}

export interface TherapistListResult {
  readonly items: readonly TherapistSummary[];
  readonly total: number;
}
