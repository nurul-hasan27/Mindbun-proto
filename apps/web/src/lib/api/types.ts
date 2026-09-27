/**
 * The shapes the API returns.
 *
 * These mirror the JSON Schemas that the backend enforces at runtime
 * (`apps/api/src/api/v1/schemas/*`). The schema is the source of truth; these
 * types are the typed view of it on this side of the wire. If a schema changes,
 * change the matching interface in the same commit.
 */

/** `GET /api/v1/health` */
export interface HealthStatus {
  readonly status: 'ok';
  readonly service: string;
  readonly version: string;
  /** ISO 8601 timestamp of the moment the response was produced. */
  readonly timestamp: string;
}

/**
 * A vocabulary term as the API sends it: a stable `key` for logic and filtering,
 * a `name` for people.
 */
export interface AttributeView {
  readonly key: string;
  readonly name: string;
}

export type DayName =
  'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** A recurring weekly window, in the therapist's own timezone. */
export interface AvailabilityWindowView {
  readonly dayOfWeek: DayName;
  /** Minutes from local midnight, e.g. 1080 for 18:00. */
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Enough to recognise someone, and to see why they might fit. */
export interface TherapistSummary {
  readonly id: string;
  readonly displayName: string;
  readonly headline: string;
  readonly location: string;
  readonly timezone: string;
  readonly yearsOfExperience: number;
  readonly languages: readonly AttributeView[];
  readonly areasOfWork: readonly AttributeView[];
  readonly communicationStyles: readonly AttributeView[];
}

/** The full profile, including everything only one person needs to see. */
export interface TherapistProfile extends TherapistSummary {
  readonly bio: string;
  readonly approaches: readonly AttributeView[];
  readonly contextualExperience: readonly AttributeView[];
  readonly sessionFormats: readonly AttributeView[];
  readonly availability: readonly AvailabilityWindowView[];
}

export interface TherapistPage {
  readonly items: readonly TherapistSummary[];
  readonly pagination: {
    readonly total: number;
    readonly take: number;
    readonly skip: number;
    readonly hasMore: boolean;
  };
}

/** Shape of an unsuccessful API response, when the server sends one. */
export interface ApiErrorPayload {
  readonly statusCode?: number;
  readonly error?: string;
  readonly message?: string;
}
