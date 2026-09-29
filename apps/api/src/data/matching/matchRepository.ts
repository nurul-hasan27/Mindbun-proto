import type { DayName } from '../dayOfWeek.js';
import type { MatchEvidenceInput, MatchStatus, RejectionCode } from './matchingTypes.js';
import type { StoredIntake } from './signals.js';

/**
 * The port the matching use case talks to.
 *
 * Four data questions and nothing else: what did this client ask for, who could
 * possibly be considered, what was decided, and what do the words mean. The engine
 * itself sits in `matchEngine.ts` and knows nothing about storage, so the whole
 * decision can be tested with a literal and no database.
 *
 * The split also keeps the retry safety honest. `saveRun` is required to be
 * idempotent *per intake*, and a repository that could write a second evaluation for
 * the same intake would silently make "why did you recommend this?" unanswerable
 * without failing a single test.
 */

/** The stored intake, joined with the preferences that go with it. */
export interface MatchableIntake {
  readonly intakeId: string;
  readonly clientId: string;
  /**
   * The preference set *this intake* produced, reduced to what the engine compares.
   *
   * Read by link rather than by recency, because Phase 4 keeps one preference set
   * per client: an older intake would otherwise be explained by newer answers, and
   * two intakes written in the same millisecond have no meaningful order at all.
   */
  readonly intake: StoredIntake;
}

/** One candidate row, ready to be written. */
export interface PersistableEvaluation {
  readonly therapistId: string;
  readonly status: MatchStatus;
  readonly rejectionCode: RejectionCode | null;
  readonly score: number;
  readonly evidence: readonly MatchEvidenceInput[];
  /** Position in the engine's deterministic order, so a read is ordered too. */
  readonly ordinal: number;
}

export interface PersistableRun {
  readonly intakeId: string;
  readonly clientId: string;
  readonly engineVersion: string;
  /**
   * Which pass this is, counting from 1.
   *
   * Resolved by the caller before the write, once, under a unique index. A first match
   * is 1; asking for another option is 2, and so on. The previous pass is never
   * touched, so the history reads as a sequence rather than being overwritten.
   */
  readonly attempt: number;
  readonly evaluations: readonly PersistableEvaluation[];
}

/** The recommended row, with its evidence read back out of storage. */
export interface StoredRecommendation {
  readonly matchId: string;
  readonly intakeId: string;
  readonly therapistId: string;
  readonly engineVersion: string;
  /** ISO 8601, when the decision was made. */
  readonly createdAt: string;
  /** The evidence as stored, which is the only source the explanations are built from. */
  readonly evidence: readonly MatchEvidenceInput[];
}

/**
 * A completed run.
 *
 * A run exists whether or not it recommended anybody: "we considered fifty people
 * and none survived" is a decision, it is stored as one, and it is what the product
 * answers with when nothing qualified. Modelling that as `recommendation: null`
 * inside a run — rather than as the absence of a run — is what keeps the two cases
 * from being confused: nothing stored, or something stored that recommends nobody.
 */
export interface StoredRun {
  readonly intakeId: string;
  /** Which pass this is. 1 for a first match, and one more for each rematch. */
  readonly attempt: number;
  readonly engineVersion: string;
  /** ISO 8601, when the decision was made. */
  readonly createdAt: string;
  /** How many candidates were evaluated, eligible or not. */
  readonly considered: number;
  readonly recommendation: StoredRecommendation | null;
}

/** Every pass on an intake, oldest first. The auditable history. */
export interface MatchHistoryEntry {
  readonly attempt: number;
  readonly matchId: string;
  readonly therapistId: string;
  readonly displayName: string;
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
  /** The reasons given, when this recommendation was turned down. */
  readonly declinedFor: readonly string[];
  /** ISO 8601, from the stored row. */
  readonly decidedAt: string;
}

/** A candidate's availability, as stored, in the therapist's own zone. */
export interface CandidateWindow {
  readonly dayOfWeek: DayName;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface MatchRepository {
  /** Stage 1. Null when no intake has that id. */
  loadMatchableIntake(intakeId: string): Promise<MatchableIntake | null>;

  /** Stage 3. Every therapist, with every structured attribute. */
  listCandidates(): Promise<
    readonly {
      readonly id: string;
      readonly displayName: string;
      readonly timezone: string;
      readonly areasOfWork: readonly string[];
      readonly communicationStyles: readonly string[];
      readonly approaches: readonly string[];
      readonly contextualExperience: readonly string[];
      readonly languages: readonly string[];
      readonly sessionFormats: readonly string[];
      readonly availability: readonly CandidateWindow[];
    }[]
  >;

  /**
   * Stage 10. Idempotent per `(intake, attempt)`: calling it twice for the same pass
   * must leave one set of rows, not two, and must return the run either way.
   */
  saveRun(run: PersistableRun): Promise<StoredRun>;

  /** One pass for an intake, or null when it has not been made. */
  findRun(intakeId: string, attempt: number): Promise<StoredRun | null>;

  /**
   * One candidate's stored evidence, read on its own.
   *
   * Needed because after a human review the person presented to the client is not
   * necessarily the pass's `RECOMMENDED` row, and the reasons on the page must be *that*
   * person's evidence. Showing the engine's reasons beside a different person would be a
   * page contradicting itself, which is the single worst thing this project could do.
   */
  readCandidateEvidence(matchId: string): Promise<readonly MatchEvidenceInput[]>;

  /**
   * The most recent pass for an intake — the current recommendation.
   *
   * Latest, not first. "Give me a recommendation for this intake" must answer with the
   * one the person is on, and after a rematch that is the newest pass. Returning the
   * first would show them the person they just turned down, which is the opposite of
   * what they asked for.
   */
  findLatestRun(intakeId: string): Promise<StoredRun | null>;

  /**
   * The pass before the newest one, for the "what changed" comparison.
   *
   * Null on a first match, which is why the comparison may legitimately be empty.
   */
  findPreviousRun(intakeId: string, beforeAttempt: number): Promise<StoredRun | null>;

  /**
   * The next pass number for an intake, and whether it has already been taken.
   *
   * Resolving the number in one place, under a unique index, is what makes a
   * concurrent pair of rematch requests produce one pass rather than two.
   */
  resolveNextAttempt(
    intakeId: string,
  ): Promise<{ readonly attempt: number; readonly taken: boolean }>;

  /** Vocabulary key → display name, so the explanation layer can speak. */
  readVocabularyNames(): Promise<ReadonlyMap<string, string>>;
}
