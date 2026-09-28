import { evaluateCandidate } from './evidence.js';
import type {
  CandidateEvaluation,
  CandidateTherapist,
  CandidateTrace,
  ClientSignals,
  EngineResult,
} from './matchingTypes.js';
import { ENGINE_VERSION } from './matchingTypes.js';
import { orderCandidates, selectRecommendation } from './ordering.js';
import { toClientSignals, type StoredIntake } from './signals.js';

/**
 * The matching engine, as a sequence of named stages.
 *
 * The brief for this phase asked for a pipeline rather than one large function, and
 * the reason is not tidiness. A matching engine is exactly the kind of thing that
 * later acquires a special case, and a special case in a 400-line function is
 * unfindable, while a special case in a 30-line stage with its own tests is not.
 * So each stage is a separate export, each is separately callable, and this file
 * only says what order they run in.
 *
 * ## The stages
 *
 * | # | Stage | Where |
 * | --- | --- | --- |
 * | 1 | Load the intake and every candidate | `MatchRepository` |
 * | 2 | Normalise to comparable signals | `signals.ts` |
 * | 3 | Retrieve candidates | `MatchRepository` |
 * | 4 | Apply hard requirements | `evaluateRequirements` |
 * | 5 | Evaluate soft preferences | `buildEvidence` |
 * | 6 | Compare availability | `availability.ts` |
 * | 7 | Produce structured evidence | `buildEvidence` |
 * | 8 | Order deterministically | `ordering.ts` |
 * | 9 | Select a recommendation | `selectRecommendation` |
 * | 10 | Persist | `MatchRepository` |
 *
 * Stages 4 to 7 all happen inside one pass over the candidates, because doing them
 * separately would mean holding every candidate's evidence in memory at once for no
 * reason: the engine is a fold, and saying so keeps it honest.
 *
 * ## Two properties this file is responsible for
 *
 * **Determinism.** The same signals and the same candidates always produce the same
 * result, on any machine, at any time. No clock is read, no randomness is used, no
 * iteration order is relied on, and every sort has a total tie-break. The
 * reference week used for availability is a constant for the same reason.
 *
 * **No hidden input.** The engine sees `ClientSignals` and `CandidateTherapist` and
 * nothing else. It has no access to a name, a biography, a place, a note, or a
 * clock, so it *cannot* use them — which is a stronger guarantee than promising it
 * will not.
 */

export interface MatchEngineInput {
  /** What the client asked for, as stored. */
  readonly intake: StoredIntake;
  /** Every candidate, with all of its structured attributes. */
  readonly candidates: readonly CandidateTherapist[];
}

export interface MatchEngineOutput {
  readonly result: EngineResult;
  /** The recommended candidate's evaluation, promoted to `RECOMMENDED`. */
  readonly recommendation: CandidateEvaluation | null;
  /** The full trace of every candidate, for a reviewer tool or a test. */
  readonly trace: readonly CandidateTrace[];
  /** The signals the comparison actually used, after normalisation. */
  readonly signals: ClientSignals;
}

/**
 * Runs the whole pipeline over a fixed set of candidates.
 *
 * The candidate list is supplied in full rather than paged: with fifty therapists a
 * "top 10 by score" query cannot be built in SQL, because the score is computed in
 * application code. Evaluating every candidate is what makes the result independent
 * of any query's `take`, and therefore reproducible.
 */
export function runMatchEngine({ intake, candidates }: MatchEngineInput): MatchEngineOutput {
  const signals = toClientSignals(intake);

  // Stage 3, then 4 to 7 in one pass per candidate.
  const evaluated: CandidateEvaluation[] = [];
  const trace: CandidateTrace[] = [];
  let availabilityUncomparable = false;

  for (const candidate of candidates) {
    const { evaluation, availabilityUncomparable: uncomputable } = evaluateCandidate(
      signals,
      candidate,
    );

    availabilityUncomparable = availabilityUncomparable || uncomputable;
    evaluated.push(evaluation);
    trace.push(toTrace(evaluation));
  }

  // Stage 8.
  const ordered = orderCandidates(evaluated);

  // Stage 9.
  const recommendation = selectRecommendation(ordered);

  // The recommendation is a promotion of the row already evaluated, never a new
  // evaluation: re-scoring the winner would be a chance for the two to disagree. The
  // promotion is applied to the list as well as returned separately, so the rows
  // that get persisted and the row the API answers with cannot be different ones.
  const promoted = recommendation === null ? null : promote(ordered, recommendation.therapistId);
  const rows = promoted === null ? ordered : markRecommended(ordered, promoted);

  return {
    result: {
      engineVersion: ENGINE_VERSION,
      candidates: rows,
      recommendation: promoted,
      availabilityUncomparable,
    },
    recommendation: promoted,
    trace,
    signals,
  };
}

function markRecommended(
  ordered: readonly CandidateEvaluation[],
  recommended: CandidateEvaluation,
): readonly CandidateEvaluation[] {
  return ordered.map((candidate) =>
    candidate.therapistId === recommended.therapistId ? recommended : candidate,
  );
}

function promote(
  ordered: readonly CandidateEvaluation[],
  therapistId: string,
): CandidateEvaluation | null {
  const winner = ordered.find((candidate) => candidate.therapistId === therapistId);

  if (winner === undefined) {
    return null;
  }

  return { ...winner, status: 'RECOMMENDED' };
}

function toTrace(evaluation: CandidateEvaluation): CandidateTrace {
  return {
    therapistId: evaluation.therapistId,
    displayName: evaluation.displayName,
    eligible: evaluation.status === 'ELIGIBLE',
    rejectionCode: evaluation.rejectionCode,
    score: evaluation.score,
    evidence: evaluation.evidence.map((item) => ({
      category: item.category,
      strength: item.strength,
      clientKey: item.clientKey,
      therapistKey: item.therapistKey,
      explanation: item.explanation,
    })),
    requirements: evaluation.requirements,
  };
}
