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
  readonly engineVersion: string;
  /** ISO 8601, when the decision was made. */
  readonly createdAt: string;
  /** How many candidates were evaluated, eligible or not. */
  readonly considered: number;
  readonly recommendation: StoredRecommendation | null;
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
   * Stage 10. Idempotent per intake: calling it twice for the same intake must
   * leave one set of rows, not two, and must return the run either way.
   */
  saveRun(run: PersistableRun): Promise<StoredRun>;

  /** A previous decision for this intake, if there is one. */
  findRun(intakeId: string): Promise<StoredRun | null>;

  /** Vocabulary key → display name, so the explanation layer can speak. */
  readVocabularyNames(): Promise<ReadonlyMap<string, string>>;
}
