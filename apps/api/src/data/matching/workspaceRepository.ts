import { DataStoreUnavailableError } from '../storeErrors.js';
import type { StoredDecision } from './decisionTypes.js';
import type { MatchEvidenceInput } from './matchingTypes.js';

/**
 * The reviewer's read model.
 *
 * A separate port from `MatchRepository` and `FeedbackRepository`, and that is a deliberate
 * boundary rather than three names for the same thing:
 *
 * - `MatchRepository` is the **engine's**. It loads signals, lists candidates, writes a
 *   pass. It is about producing a decision.
 * - `FeedbackRepository` is the **conversation's**. What a client said, and what has been
 *   declined.
 * - This one is the **reviewer's**. Cases, the candidates within a case, and the human
 *   decision made about it.
 *
 * The overlap is real — a workspace needs evidence and feedback — and it is reached by
 * *composition* rather than by widening a port. A service that decides can depend on the
 * engine's port without gaining the ability to rewrite a pass, because this port has no
 * method that writes one.
 *
 * **No method here takes a client id, an intake id or a therapist id.** Every read is
 * reached from a match id, and every write names a candidate from a pass the engine already
 * evaluated. That is the whole of the internal security model, and it is structural: there
 * is no field a caller could fill in to steer a review.
 */

/** One candidate within a pass, as stored. */
export interface CaseCandidateRow {
  readonly matchId: string;
  readonly therapistId: string;
  readonly eligible: boolean;
  readonly rejectionCode: string | null;
  readonly evidence: readonly MatchEvidenceInput[];
}

/** A pass, and everything about it a reviewer needs. */
export interface CaseRow {
  /** The pass's recommended match. The case's identity. */
  readonly matchId: string;
  readonly intakeId: string;
  readonly clientId: string;
  readonly attempt: number;
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
  /** The engine's own recommendation, which a decision never overwrites. */
  readonly recommendedTherapistId: string;
  /**
   * Every candidate of this pass, in the engine's own order.
   *
   * That order is recovered from storage as `score` descending then therapist id
   * ascending, which is exactly the order the engine produced — so the workspace shows the
   * engine's shortlist rather than a ranking the interface invented. The score itself is
   * never sent: it decides an order and then disappears.
   */
  readonly candidates: readonly CaseCandidateRow[];
  /** The decision made about this case, when one has been made. */
  readonly decision: StoredDecision | null;
}

/**
 * A case with no decision, as the list needs it.
 *
 * Carries the stored need keys rather than leaving the service to fetch each intake's
 * preferences, so the whole list costs two queries — the rows and the vocabulary — instead
 * of one query per case. A queue that gets slower as it gets fuller is the first thing
 * that makes a reviewer stop looking at it.
 */
export interface CaseListRow {
  readonly matchId: string;
  readonly intakeId: string;
  readonly attempt: number;
  readonly recommendedTherapistId: string;
  /** Whether this intake has more than one pass, or any recorded feedback. */
  readonly hasHistory: boolean;
  /** The stored keys per family, for a short summary line. */
  readonly needs: StoredNeedKeys;
}

/** What the client asked for, as keys. Names are resolved from the vocabulary. */
export interface StoredNeedKeys {
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly approaches: readonly string[];
  readonly contextualExperiences: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
  readonly openToGuidance: boolean;
  readonly markedAsRequirements: boolean;
}

/** The client's free text, behind an explicit opt-in. */
export interface ClientsWordsRow {
  readonly intakeNote: string | null;
  readonly feedbackNotes: readonly { readonly attempt: number; readonly note: string }[];
}

export interface RecordDecisionInput {
  /** The case being decided. */
  readonly matchId: string;
  /** The candidate chosen, from the ones this case offered. */
  readonly selectedMatchId: string;
  readonly decisionType: 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';
  readonly reasonKeys: readonly string[];
  readonly note: string | null;
}

export interface WorkspaceRepository {
  /**
   * Cases waiting for a decision, newest pass first.
   *
   * "Waiting" is a fact of the state machine rather than a flag: a pass stands for review
   * while its recommendation is `RECOMMENDED`, and asking for another option turns that
   * into `DECLINED`. So `RECOMMENDED` selects exactly the current pass of each intake —
   * an earlier pass cannot still be `RECOMMENDED` if a later one exists, because the only
   * route to a later one runs through feedback, and feedback is what declines it. There is
   * no "needs review" column to fall out of step.
   */
  listCases(): Promise<readonly CaseListRow[]>;

  /** One case and its candidates, or null when there is no such match. */
  findCase(matchId: string): Promise<CaseRow | null>;

  /** Every pass on an intake, for the journey timeline. */
  listJourney(intakeId: string): Promise<readonly JourneyRow[]>;

  /** The recorded decisions for a set of cases, keyed by the case's match id. */
  findDecisions(matchIds: readonly string[]): Promise<ReadonlyMap<string, StoredDecision>>;

  /**
   * Record a decision, and change nothing else.
   *
   * Idempotent per case: a repeated call returns the first decision rather than writing a
   * second one, because a decision is a record of a past moment and re-deciding is not a
   * revision — the same rule as a declined match.
   */
  recordDecision(input: RecordDecisionInput): Promise<StoredDecision>;

  /** The reason vocabulary, read fresh rather than captured at start-up. */
  readDecisionReasons(): Promise<readonly { key: string; name: string; description: string }[]>;

  /**
   * The client's own words, which the case payload leaves out.
   *
   * A separate method rather than a flag, so reaching for it is a visible second request
   * rather than a query string on the first one. That is the difference between an opt-in
   * that is auditable and one that is only documented.
   */
  readClientsWords(intakeId: string): Promise<ClientsWordsRow>;
}

/** One pass in a journey, for the timeline. */
export interface JourneyRow {
  readonly attempt: number;
  readonly matchId: string;
  readonly recommendedTherapistId: string;
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
  /** Reason keys the client gave about this pass, sorted. */
  readonly feedbackReasonKeys: readonly string[];
  readonly decision: StoredDecision | null;
  /** Who the decision selected, resolved from the selected candidate row. */
  readonly selectedTherapistId: string | null;
}

/**
 * No store configured.
 *
 * The same shape as the real port, failing the same way, so `buildApp()` can be exercised
 * without a database and the failure is a `503` with a sentence rather than a crash. The
 * alternative — a partial object with the methods `undefined` — turns a missing store into
 * a `TypeError` somewhere further in, which is a much worse thing to debug.
 */
export function createUnavailableWorkspaceRepository(
  message = 'The matching workspace is not available.',
): WorkspaceRepository {
  const unavailable = (): never => {
    throw new DataStoreUnavailableError(message);
  };

  return {
    listCases: unavailable,
    findCase: unavailable,
    listJourney: unavailable,
    findDecisions: unavailable,
    recordDecision: unavailable,
    readDecisionReasons: unavailable,
    readClientsWords: unavailable,
  };
}
