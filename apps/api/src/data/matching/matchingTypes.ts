/**
 * The shapes the matching engine speaks.
 *
 * The rule that governs this whole file: **an engine result is a function of
 * structured attributes and nothing else.** No name, place, biography or free
 * text is an input, and nothing here can be derived from one. If a future
 * reviewer asks why someone was recommended, the answer has to be reconstructible
 * from these types alone — which is what makes it testable, and what makes the
 * "no black box" claim mean something other than a slogan.
 *
 * The three that mirror Prisma enums are declared as literal unions rather than
 * imported, so the engine has no dependency on a generated client and can be
 * tested without a database. `prismaMatchRepository.ts` is the one place the two
 * must agree, and a test in this directory checks they do.
 */

import type { DayName } from '../dayOfWeek.js';
import type { ZonedWindow } from './availability.js';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Mirrors the `MatchCategory` enum. */
export const MATCH_CATEGORIES = [
  'AREA_OF_WORK',
  'LANGUAGE',
  'COMMUNICATION_STYLE',
  'THERAPEUTIC_APPROACH',
  'CONTEXTUAL_EXPERIENCE',
  'SESSION_FORMAT',
  'AVAILABILITY',
] as const;
export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

/**
 * Mirrors the `MatchExplanation` enum: the whole vocabulary of reasons a client
 * can be given.
 *
 * One entry per thing that can be said about a match, and each has exactly one
 * meaning. A sentence can only be written for one of these, which is what makes
 * "every sentence maps to evidence" a property of the type rather than a promise
 * in a document. Adding a category of match means adding a value here first — a
 * new reason cannot be explained until someone has decided what it *is*.
 */
export const MATCH_EXPLANATIONS = [
  'REQUIRED_LANGUAGE',
  'PREFERRED_LANGUAGE',
  'AREA_OF_WORK',
  'COMMUNICATION_STYLE',
  'THERAPEUTIC_APPROACH',
  'CONTEXTUAL_EXPERIENCE',
  'SESSION_FORMAT',
  'AVAILABILITY_OVERLAP',
] as const;
export type MatchExplanation = (typeof MATCH_EXPLANATIONS)[number];

/** Mirrors the `MatchStatus` enum. */
export type MatchStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED';

/** Mirrors the `PreferenceKind` enum, which the intake phase already owns. */
export type PreferenceStrength = 'REQUIREMENT' | 'PREFERENCE';

/**
 * Why a candidate was set aside.
 *
 * Three conditions can eliminate a candidate, so there are three reasons, and adding a
 * fourth is the moment someone has to justify a new rule in public.
 *
 * `DECLINED_PREVIOUSLY` is different in kind from the other two, and deliberately so.
 * The first two are facts about this therapist and this client: they do not offer a
 * shared language, or a format the client accepted. The third is a decision the client
 * already made — "not this one" — and it is recorded as a rejection rather than
 * silently dropped, so a reviewer reading this journey can see that the person was
 * considered, and why they are not being shown again. A candidate vanishing without a
 * trace would be the same as never having been in the list, which is a different and
 * less honest thing to be.
 */
export const REJECTION_CODES = [
  'NO_SHARED_LANGUAGE',
  'NO_ACCEPTED_SESSION_FORMAT',
  'DECLINED_PREVIOUSLY',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

/**
 * The version of the algorithm that produced a result.
 *
 * Bumping this is not cosmetic. A stored match has to be attributable to the rules
 * that produced it, or it can be neither explained nor recognised as stale.
 */
export const ENGINE_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A named condition the client needs met, with the quantifier it needs it under. */
export type RequirementRule =
  | {
      readonly quantifier: 'ANY_OF';
      /** Stable name for the rule, e.g. "language". Used as the evidence's clientKey. */
      readonly ruleKey: string;
      readonly category: MatchCategory;
      /** The keys the client chose. The therapist must offer at least one. */
      readonly keys: readonly string[];
      /** How the interface words it, for the rejection explanation. */
      readonly label: string;
    }
  | {
      readonly quantifier: 'ALL_OF';
      readonly ruleKey: string;
      readonly category: MatchCategory;
      /** The therapist must offer every one of these. */
      readonly keys: readonly string[];
      readonly label: string;
    };

/**
 * Everything the client asked for, reduced to keys.
 *
 * Stage two of the pipeline produces this, and nothing downstream of it touches the
 * database. A test can build one by hand in three lines, which is the point: the
 * engine is testable without a database because everything it needs fits in a
 * literal.
 */
export interface ClientSignals {
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  /**
   * The person said they are not yet sure what kind of conversation they want.
   *
   * This suppresses communication-style evidence rather than merely leaving the
   * list empty. They did not say "no style matters" — they said "I do not know
   * yet", and scoring a candidate down for it would be answering a question they
   * declined to answer.
   */
  readonly openToGuidance: boolean;
  /** Empty in this phase: the intake does not ask about approaches yet. */
  readonly approaches: readonly string[];
  readonly contextualExperiences: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
  readonly availability: {
    readonly timezone: string;
    readonly windows: readonly ZonedWindow[];
  } | null;
  readonly requirements: readonly RequirementRule[];
}

/**
 * One candidate as the engine reads it: every structured attribute, and nothing
 * else.
 *
 * `approaches` and `contextualExperience` are here as declared, stated facts about
 * a therapist's practice. Nothing in this interface is derivable from a name or a
 * postcode, which is exactly why the interface has no fields that could be.
 */
export interface CandidateTherapist {
  readonly id: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly approaches: readonly string[];
  readonly contextualExperience: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
  readonly availability: readonly ZonedWindow[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/**
 * One reason, in structured form.
 *
 * Self-contained on purpose: reading it must never require going back to the intake
 * or the profile to work out what it meant. `clientKey` and `therapistKey` are the
 * vocabulary keys on each side; the `overlap*` fields carry the one piece of numeric
 * fact any evidence has, and are null unless the category is availability.
 */
export interface MatchEvidenceInput {
  readonly category: MatchCategory;
  readonly strength: PreferenceStrength;
  readonly clientKey: string;
  readonly therapistKey: string;
  readonly explanation: MatchExplanation;
  /** In tenths. Internal only; never leaves the engine. */
  readonly weight: number;
  /** Availability only: the shared slot, in the client's own local time. */
  readonly overlap?: {
    readonly dayOfWeek: DayName;
    readonly startMinute: number;
    readonly endMinute: number;
    /** The same instant on the therapist's clock. */
    readonly therapistDayOfWeek: DayName;
    readonly therapistStartMinute: number;
    readonly therapistEndMinute: number;
    /** Which reference weeks the slot was found in, e.g. both or just one. */
    readonly weeks: readonly string[];
  };
}

/** How a requirement fared, whether or not the candidate survived it. */
export interface RequirementOutcome {
  readonly ruleKey: string;
  readonly label: string;
  readonly satisfied: boolean;
  /** The client's keys the therapist does not offer. Empty when satisfied. */
  readonly missing: readonly string[];
}

/** One candidate, fully evaluated. This is what gets persisted as a `Match`. */
export interface CandidateEvaluation {
  readonly therapistId: string;
  readonly displayName: string;
  readonly status: MatchStatus;
  readonly rejectionCode: RejectionCode | null;
  /** Internal compatibility figure. An ordering aid, never a measure of a person. */
  readonly score: number;
  readonly evidence: readonly MatchEvidenceInput[];
  readonly requirements: readonly RequirementOutcome[];
}

/** Everything the engine decided, before anything is written. */
export interface EngineResult {
  readonly engineVersion: string;
  /** Every candidate considered, eligible or not. */
  readonly candidates: readonly CandidateEvaluation[];
  /** The one to show, or null when nothing survived. */
  readonly recommendation: CandidateEvaluation | null;
  /** Set when a timezone could not be read, so no availability was compared. */
  readonly availabilityUncomparable: boolean;
}

/**
 * The developer-facing trace of one evaluation.
 *
 * Deliberately separate from `CandidateEvaluation`, which is what leaves the engine.
 * A reviewer tool, a test and a `console.log` all want the candidate's name, the
 * requirement that failed and the running score; none of that is appropriate in an
 * HTTP response, and keeping the two apart is what stops "just add the score to the
 * response" from ever being a small change.
 */
export interface CandidateTrace {
  readonly therapistId: string;
  readonly displayName: string;
  readonly eligible: boolean;
  readonly rejectionCode: RejectionCode | null;
  readonly score: number;
  readonly evidence: readonly {
    readonly category: MatchCategory;
    readonly strength: PreferenceStrength;
    readonly clientKey: string;
    readonly therapistKey: string;
    readonly explanation: MatchExplanation;
  }[];
  readonly requirements: readonly RequirementOutcome[];
}
