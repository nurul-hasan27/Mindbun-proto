import { DataStoreUnavailableError } from '../storeErrors.js';
import type { FeedbackReasonKey, RematchContext, StoredFeedback } from './feedbackTypes.js';
import type { MatchEvidenceInput } from './matchingTypes.js';

/**
 * The port for everything about a recommendation *after* it was made.
 *
 * Separate from `MatchRepository` because it answers different questions. That port
 * belongs to the engine — load signals, list candidates, write a pass. This one belongs
 * to the conversation: what did someone say, which matches have been declined, and what
 * does the history look like.
 *
 * Every method here takes a `matchId` and derives everything else. There is deliberately
 * no method that accepts a client id or a therapist id, because a port with one would
 * eventually be called with one, and the caller's browser would be the source of it.
 */

/** A stored match, as the feedback side needs to see it. */
export interface MatchHeader {
  readonly matchId: string;
  readonly intakeId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly attempt: number;
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
  /** Whether this pass has a recommendation, which is not the same as this row. */
  readonly isRecommended: boolean;
}

/** The structured attributes of a therapist, for the "what changed" comparison. */
export interface ComparisonCandidate {
  readonly therapistId: string;
  readonly displayName: string;
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly approaches: readonly string[];
  readonly contextualExperience: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
}

export interface FeedbackRepository {
  /**
   * The match a feedback or rematch is about, or null when there is no such id.
   *
   * Null is the *only* answer for "no such match" and for "not yours", deliberately
   * indistinguishable: a caller who could tell those apart could confirm that an id
   * exists, which is an enumeration oracle.
   */
  findMatch(matchId: string): Promise<MatchHeader | null>;

  /** What someone said about this match, if they have. */
  findFeedback(matchId: string): Promise<StoredFeedback | null>;

  /**
   * Record feedback and mark the match declined, in one transaction.
   *
   * One transaction because the two must agree: a feedback row pointing at a
   * `RECOMMENDED` match would mean someone was told "we'll look again" and the search
   * would treat the match as current. Either both happen or neither.
   *
   * Idempotent per match — a double submit is one row, because `matchId` is unique on
   * `feedback` and a person declining the same recommendation twice has not said
   * anything new.
   */
  recordFeedback(input: RecordFeedbackInput): Promise<StoredFeedback>;

  /**
   * Everything a rematch needs, derived from storage.
   *
   * The exclusion set is the therapists already `DECLINED` on **this intake** — the
   * matching journey, not the client and not the dataset. A therapist declined here can
   * be perfectly recommendable to a different person or on a different intake later,
   * and nothing about a single search should follow someone around the service.
   */
  loadRematchContext(matchId: string): Promise<RematchContext | null>;

  /** The evidence stored for a match, for the comparison. */
  readMatchEvidence(matchId: string): Promise<readonly MatchEvidenceInput[]>;

  /** One therapist's structured attributes, for the comparison. */
  readComparisonCandidate(therapistId: string): Promise<ComparisonCandidate | null>;

  /**
   * Every term the product offers, read from the vocabulary.
   *
   * The whole entry rather than just the key, because the page shows the wording and
   * the wording is data: `key` is the contract the engine matches on, `name` is copy a
   * copywriter will rewrite, and the two are allowed to diverge. A client with the
   * words hardcoded would have to be changed to change a sentence, and would be free
   * to drift from what the database actually holds.
   *
   * A method rather than a value so the list cannot go stale: a term added to the
   * database has to be offerable without a code change.
   */
  readReasons(): Promise<readonly FeedbackReason[]>;
}

/** One term, as the vocabulary holds it. */
export interface FeedbackReason {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export interface RecordFeedbackInput {
  readonly matchId: string;
  readonly reasons: readonly FeedbackReasonKey[];
  readonly rawText: string | null;
}

/**
 * In-memory feedback repository.
 *
 * Used by the tests and by `buildApp()` when no store is configured, so the shape of
 * the port is exercised even before anyone has written a Prisma adapter. Kept next to
 * the port rather than in a test helper because the unavailable fallback in `app.ts`
 * needs the same thing: an object with the right methods that fails in the right way.
 */
export function createUnavailableFeedbackRepository(
  message = 'The feedback store is not available.',
): FeedbackRepository {
  const unavailable = (): never => {
    throw new DataStoreUnavailableError(message);
  };

  return {
    findMatch: unavailable,
    findFeedback: unavailable,
    recordFeedback: unavailable,
    loadRematchContext: unavailable,
    readMatchEvidence: unavailable,
    readComparisonCandidate: unavailable,
    // Empty, deliberately. With no vocabulary, no reason is one we offer, and a named
    // one is refused rather than recorded with nothing.
    readReasons: () => Promise.resolve<readonly FeedbackReason[]>([]),
  };
}
