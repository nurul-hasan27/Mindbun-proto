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

// --------------------------------------------------------------------------
// Intake
//
// Mirrors `apps/api/src/api/v1/schemas/intake.ts` and
// `apps/api/src/data/intake/intakeTypes.ts`. The vocabulary is fetched rather
// than hardcoded, so these are the shapes and the client reads the terms from
// the service.
// --------------------------------------------------------------------------

export interface LanguageView {
  /** ISO 639-1, e.g. "en". */
  readonly code: string;
  readonly name: string;
}

export interface IntakeVocabulary {
  readonly areasOfWork: readonly AttributeView[];
  readonly communicationStyles: readonly AttributeView[];
  readonly contextualExperience: readonly AttributeView[];
  readonly languages: readonly LanguageView[];
  readonly sessionFormats: readonly AttributeView[];
}

export interface AvailabilityInput {
  /** IANA zone name, e.g. "Asia/Kolkata". The client sends this; people see words. */
  readonly timezone: string;
  readonly windows: readonly AvailabilityWindowView[];
}

/** `POST /api/v1/intakes` — the request, as this client sends it. */
export interface IntakeDraftPayload {
  /** Anonymous id for this visit, so one visit reuses one client row. */
  readonly sessionId: string;
  /** Anonymous id for this submission, so a retry cannot store it twice. */
  readonly submissionId: string;
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly contextualExperiences: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
  readonly availability: AvailabilityInput | null;
  /** The person said they are not yet sure what kind of conversation they want. */
  readonly openToGuidance: boolean;
  readonly rawText: string;
}

export interface IntakeReceipt {
  readonly intakeId: string;
  readonly receivedAt: string;
}

/** Shape of an unsuccessful API response, when the server sends one. */
export interface ApiErrorPayload {
  readonly statusCode?: number;
  readonly error?: string;
  readonly message?: string;
}

// --------------------------------------------------------------------------
// Matching
//
// Mirrors `apps/api/src/api/v1/schemas/matches.ts`.
//
// What is deliberately *not* here, and is not merely omitted by accident: a score,
// a rank, a percentage, a list of anyone else, an engine version, a rejection
// reason. The server's schemas declare the response with `additionalProperties:
// false`, so a field added on that side fails the API's own tests rather than
// reaching a browser. A product arguing against being a marketplace should make
// that structurally true rather than a matter of remembering.
// --------------------------------------------------------------------------

export interface MatchReason {
  /** The machine key the sentence came from, so it can be traced back to evidence. */
  readonly key: string;
  /** The full sentence. Never contains a number or a comparison. */
  readonly sentence: string;
  /** A short noun phrase, for a compact label. */
  readonly detail: string;
}

export interface MatchedTherapist {
  /** Present so the profile can be linked; the profile endpoint is already public. */
  readonly id: string;
  readonly displayName: string;
  readonly headline: string;
  readonly bio: string;
  readonly location: string;
  readonly timezone: string;
  readonly yearsOfExperience: number;
  readonly languages: readonly AttributeView[];
  readonly areasOfWork: readonly AttributeView[];
  readonly communicationStyles: readonly AttributeView[];
  readonly approaches: readonly AttributeView[];
  readonly contextualExperience: readonly AttributeView[];
  readonly sessionFormats: readonly AttributeView[];
  readonly availability: readonly AvailabilityWindowView[];
}

export interface MatchRecommendation {
  readonly matchId: string;
  /** ISO 8601, from the stored decision rather than from a clock in the browser. */
  readonly decidedAt: string;
  readonly therapist: MatchedTherapist;
  readonly whyThisMatch: readonly MatchReason[];
}

export interface NoCandidateOutcome {
  readonly outcome: 'no_candidate';
  /** How many were considered. A fact, not a score. */
  readonly considered: number;
}

export type MatchOutcome = MatchRecommendation | NoCandidateOutcome;

export function isRecommendation(value: MatchOutcome): value is MatchRecommendation {
  return 'therapist' in value;
}
