import type { StoredDecision } from './decisionTypes.js';

/**
 * The two fields of a decision that answer the question, and nothing else.
 *
 * A structural minimum rather than the whole `StoredDecision`, because two of the three
 * call sites read this from a query that has selected only what it needs — the reasons and
 * the note are of no use to them. Asking them to assemble a decision object they would then
 * have to fill with fiction is how a wrong answer gets typed in.
 */
export interface Selection {
  readonly selectedMatchId: string;
  readonly therapistId: string;
}

/**
 * Who the client is actually being shown.
 *
 * ## Why this is a function and not a column
 *
 * There are three facts in this system that must never be confused, and they are three
 * different things:
 *
 * 1. **What the engine produced.** A `Match` row with `status: RECOMMENDED`, written by
 *    `saveRun` and never touched again.
 * 2. **What a human matcher selected.** A `MatchingDecision` row, beside it, pointing at a
 *    candidate row from the same pass.
 * 3. **What the client is shown.** Not stored — it is *derived* from the first two.
 *
 * Deriving it is the point. A stored "who we showed the client" column would be a third
 * fact free to disagree with the other two, and the disagreement would be invisible: every
 * page would still render, from its own copy of the wrong answer.
 *
 * ## Why it needs one shared function
 *
 * Three separate places need this answer, and they need it to be the same answer:
 *
 * - the client-facing recommendation, which must show the human-selected therapist;
 * - the feedback record, which must attribute a complaint to the person who was shown,
 *   not to the person the engine happened to suggest;
 * - the exclusion set for a rematch, which must exclude the therapist the client declined
 *   rather than the one the engine offered.
 *
 * Each of those could work it out for itself. If they did, they would agree today and
 * diverge the first time a decision was made on a pass that also had feedback — and the
 * symptom would be a client being told they had just declined someone they were never
 * shown. So it is one function, with a name, and a test that pins all three to it.
 *
 * ## The property that makes it hard to get wrong
 *
 * When a matcher keeps the engine's suggestion, `selectedMatchId` **is** `matchId`, so the
 * decision's therapist is the engine's therapist. Accepting a suggestion and never having
 * reviewed it therefore produce the same answer, and there is no branch here that could
 * treat the two differently.
 */

/** The engine's own recommendation for a pass. */
export interface EngineRecommendation {
  /** The pass's recommended match. Also the case's identity. */
  readonly matchId: string;
  readonly therapistId: string;
}

export interface PresentedRecommendation {
  /**
   * The pass's recommended match.
   *
   * What feedback is filed against, and what the exclusion set is scoped by. It does not
   * change when a human chooses someone else — the *case* is still that row, because that
   * is the decision the matcher reviewed.
   */
  readonly caseMatchId: string;
  /**
   * The row actually presented to the client.
   *
   * The same row as `caseMatchId` unless a human chose another candidate from the same pass.
   */
  readonly presentedMatchId: string;
  readonly therapistId: string;
  /**
   * Whether a person is responsible for what the client sees.
   *
   * Not sent to a client, and never used to change the client's copy: the client is told
   * the same thing either way, because the internal mechanics are none of their business.
   */
  readonly reviewed: boolean;
}

export function presentedTherapistId(
  engine: EngineRecommendation,
  decision: Selection | null,
): string {
  return decision === null ? engine.therapistId : decision.therapistId;
}

/**
 * The full answer: which row to read evidence from, and who it is for.
 *
 * `presentedMatchId` matters as much as the therapist, because the reasons the client reads
 * must be the *selected* candidate's evidence. Showing the engine's reasons beside a
 * different person would be a page that contradicts itself, and it would be the most
 * serious kind of bug this feature could have.
 */
export function presentedRecommendation(
  engine: EngineRecommendation,
  decision: StoredDecision | null,
): PresentedRecommendation {
  if (decision === null) {
    return {
      caseMatchId: engine.matchId,
      presentedMatchId: engine.matchId,
      therapistId: engine.therapistId,
      reviewed: false,
    };
  }

  return {
    caseMatchId: engine.matchId,
    presentedMatchId: decision.selectedMatchId,
    therapistId: decision.therapistId,
    reviewed: true,
  };
}

/** Whether a decision kept the engine's suggestion, whatever the type says. */
export function acceptedSuggestion(
  engine: EngineRecommendation,
  decision: Selection | null,
): boolean {
  return decision !== null && decision.selectedMatchId === engine.matchId;
}
