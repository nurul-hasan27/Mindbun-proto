import type { DayName } from '../dayOfWeek.js';

/**
 * The shapes the intake domain exchanges.
 *
 * No Prisma types appear here. This module is the vocabulary that the routes,
 * the repository and (mirrored by hand) the frontend all agree on, which is what
 * keeps generated row types from reaching the HTTP contract.
 */

/** A curated term, as the client is offered it. */
export interface AttributeOption {
  readonly key: string;
  readonly name: string;
}

export interface LanguageOption {
  /** ISO 639-1, e.g. "en". */
  readonly code: string;
  readonly name: string;
}

/**
 * Everything a client may be asked to choose from, fetched at runtime.
 *
 * The client asks for its questions to be *about* real data, so that a keyword
 * it sends is never one the database has not heard of.
 */
export interface IntakeVocabulary {
  readonly areasOfWork: readonly AttributeOption[];
  readonly communicationStyles: readonly AttributeOption[];
  readonly contextualExperience: readonly AttributeOption[];
  readonly languages: readonly LanguageOption[];
  readonly sessionFormats: readonly AttributeOption[];
}

export interface AvailabilityWindowInput {
  readonly dayOfWeek: DayName;
  /** Minutes from local midnight in `timezone`. */
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface AvailabilityInput {
  /** IANA zone name, e.g. "Asia/Kolkata". */
  readonly timezone: string;
  readonly windows: readonly AvailabilityWindowInput[];
}

/** `POST /api/v1/intakes` — the body, after it has been checked. */
export interface IntakeRequest {
  /** Anonymous identifier for one visit, minted by the browser. */
  readonly sessionId: string;
  /** Anonymous identifier for one submission, so a retry cannot duplicate it. */
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
  /** ISO 8601, the moment the intake was stored. */
  readonly receivedAt: string;
}
