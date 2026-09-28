import type { MatchEvidenceInput } from './matchingTypes.js';

/**
 * What someone said about one recommendation, and what the system did about it.
 *
 * The two halves of this file are the two halves of the phase, and they are kept apart
 * on purpose: the first is a *record*, the second is a *rule*. Only the record is ever
 * persisted. The rule is code, so it can be read, argued with, and changed in one place.
 *
 * ## The sentence this module exists to keep honest
 *
 * The product says **"We took your feedback into account."**
 *
 * That is a claim, and a vague one. It could mean the system learned something about
 * the client, adapted to them, or got better at matching. None of those is true. What
 * actually happens is narrower, and this is the whole of it:
 *
 * 1. The therapist the client declined is excluded from the rest of this journey.
 * 2. The categories the client mentioned count for more in the next ordering, up to a
 *    ceiling.
 *
 * That is the entire mechanism. There is no model, nothing is stored about the client
 * beyond this one journey, and the same intake with the same feedback always produces
 * the same next person. "Took your feedback into account" is *true* of that; "learned"
 * would not be. See `feedbackSignals.ts` for the reasoning, and `feedbackWeights` for
 * the ceiling.
 *
 * ## What a reason never means
 *
 * A reason is a report about an interaction, never a finding about a person.
 *
 * | Reported                        | Does **not** mean                          |
 * | ------------------------------- | ------------------------------------------ |
 * | "I did not feel understood"     | the therapist is ineffective              |
 * | "the communication style..."    | the therapist is a poor communicator      |
 * | "the timing did not work"       | the therapist is disorganised             |
 * | "I wanted different experience" | the therapist lacks experience            |
 *
 * A table that cannot express that distinction will eventually be read as making it, so
 * the model cannot: there is no sentiment, no rating, and no score on a `Feedback` row.
 * What is stored is *the client reported this, in these terms, about this match*, and the
 * match is marked `DECLINED` — a statement about their choice, not about the therapist.
 */

/** A stable reason key, e.g. `communication-mismatch`. */
export type FeedbackReasonKey = string;

/** The terms a person picked, plus anything they chose to add. */
export interface FeedbackRequest {
  readonly reasons: readonly FeedbackReasonKey[];
  /** Optional free text. Stored, never parsed, never logged, never matched on. */
  readonly rawText?: string;
}

/**
 * A feedback row and the match it responds to.
 *
 * `clientId` and `therapistId` are carried here for convenience but are **derived on the
 * server** from the match. They are never accepted from a browser, because a browser
 * that can name a client or a therapist here can write a complaint about someone else's
 * match.
 */
export interface StoredFeedback {
  readonly id: string;
  readonly clientId: string;
  readonly intakeId: string;
  readonly therapistId: string;
  readonly matchId: string;
  readonly reasonKeys: readonly FeedbackReasonKey[];
  readonly rawText: string | null;
  readonly createdAt: string;
  /** ISO 8601, from the stored row rather than a fresh clock reading. */
  readonly recordedAt: string;
}

/** The receipt `POST /matches/:matchId/feedback` answers with. */
export interface FeedbackReceipt {
  readonly feedbackId: string;
  readonly matchId: string;
  readonly reasons: readonly FeedbackReasonKey[];
  readonly recordedAt: string;
}

/**
 * What a rematch is being asked relative to.
 *
 * Loaded from a match id and nothing else. The exclusion set and the signals are both
 * derived from what is already stored, so there is no field here a caller could fill in
 * to steer the search — no weights, no scores, no ids to exclude.
 */
export interface RematchContext {
  readonly matchId: string;
  readonly intakeId: string;
  readonly clientId: string;
  /** The therapist being replaced. Always excluded, along with every earlier one. */
  readonly therapistId: string;
  /** The pass this match belongs to. */
  readonly attempt: number;
  /** The pass number a rematch from here would be. */
  readonly nextAttempt: number;
  /** Every therapist already declined on this intake, oldest first. */
  readonly declinedTherapistIds: readonly string[];
  /**
   * Whether a later pass already exists on this intake.
   *
   * This is what makes a repeated rematch a retry rather than a new search. Without
   * it, a double click on "look again" would skip past a real person to the one after
   * them — which is a different search, reached by accident, and would quietly burn
   * through the list two people at a time.
   */
  readonly hasLaterAttempt: boolean;
  /** Whether feedback has been recorded for it. A rematch needs a reason. */
  readonly hasFeedback: boolean;
}

/**
 * One difference between two recommendations, phrased so that a person can check it.
 *
 * Every sentence here is a function of stored facts about two therapists, and a
 * difference that cannot be shown is not shown. `describeChange` in `whatChanged.ts` is
 * the only thing that builds these, which is what keeps the section evidence-backed
 * rather than merely plausible.
 */
export interface ChangeNote {
  /** Which attribute family changed, as a stable key. */
  readonly category: string;
  /** One sentence. Never contains a score, a weight, or a comparison of numbers. */
  readonly sentence: string;
  /** A short noun phrase for a label beside the sentence. */
  readonly detail: string;
}

/** The two recommendations, as read back from storage, for the comparison above. */
export interface ComparisonSide {
  readonly matchId: string;
  readonly therapistId: string;
  readonly displayName: string;
  readonly evidence: readonly MatchEvidenceInput[];
  readonly attributes: ComparisonAttributes;
}

/** The structured attributes a "what changed" sentence is allowed to be about. */
export interface ComparisonAttributes {
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly approaches: readonly string[];
  readonly contextualExperience: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
}
