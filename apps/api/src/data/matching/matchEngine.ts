import { evaluateCandidate } from './evidence.js';
import type { FeedbackSignals } from './feedbackSignals.js';
import { NO_FEEDBACK_SIGNALS } from './feedbackSignals.js';
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
 * ## What Phase 6 added
 *
 * Two inputs, and only two. Neither is a new pipeline stage, and neither changes how
 * the engine compares anything:
 *
 * - **`excludedTherapistIds`** — therapists this journey has already declined. They are
 *   still *evaluated*; they are set aside with `DECLINED_PREVIOUSLY`, so the record
 *   shows they were considered rather than pretending they were never in the list. See
 *   `evaluateExclusions` for why that matters.
 * - **`feedback`** — weight adjustments and the categories the person spoke about. These
 *   change how much a category counts, never whether a requirement applies. See
 *   `feedbackSignals.ts` for the reasoning, which is the important part.
 *
 * A first match is simply this pipeline with an empty exclusion set and
 * `NO_FEEDBACK_SIGNALS`. There is one engine, and a rematch is the same function with
 * different inputs — not a second code path that could disagree with the first about
 * what "the best candidate" means.
 *
 * ## Three properties this file is responsible for
 *
 * **Determinism.** The same signals, the same feedback, the same exclusions and the same
 * candidates always produce the same result, on any machine, at any time. No clock is
 * read, no randomness is used, no iteration order is relied on, and every sort has a
 * total tie-break. The reference week used for availability is a constant for the same
 * reason.
 *
 * **No hidden input.** The engine sees `ClientSignals`, `CandidateTherapist`,
 * `FeedbackSignals` and a list of ids, and nothing else. It has no access to a name, a
 * biography, a place, a note, a clock, or a client's identifier, so it *cannot* use them —
 * which is a stronger guarantee than promising it will not.
 *
 * **The requirements are the intake's.** Feedback cannot reach them. `signals.ts` builds
 * them from what the person selected and `PreferenceKind` alone, and nothing in
 * `feedbackSignals.ts` is reachable from `deriveRequirements`. A complaint makes a
 * preference count for more; it never invents a condition.
 */

export interface MatchEngineInput {
  /** What the client asked for, as stored. */
  readonly intake: StoredIntake;
  /** Every candidate, with all of its structured attributes. */
  readonly candidates: readonly CandidateTherapist[];
  /**
   * Therapists this journey has already declined.
   *
   * Scoped to the journey by whoever builds it, not by the engine: the engine has no
   * idea what a journey is. See `feedbackService.ts` for how the set is derived, and why
   * it deliberately does not persist across unrelated intakes.
   */
  readonly excludedTherapistIds?: readonly string[];
  /** What the person said about the previous recommendation. */
  readonly feedback?: FeedbackSignals;
}

export interface MatchEngineOutput {
  readonly result: EngineResult;
  /** The recommended candidate's evaluation, promoted to `RECOMMENDED`. */
  readonly recommendation: CandidateEvaluation | null;
  /** The full trace of every candidate, for a reviewer tool or a test. */
  readonly trace: readonly CandidateTrace[];
  /** The signals the comparison actually used, after normalisation. */
  readonly signals: ClientSignals;
  /** The feedback the comparison actually used, for a test or a trace. */
  readonly feedback: FeedbackSignals;
}

/**
 * Runs the whole pipeline over a fixed set of candidates.
 *
 * The candidate list is supplied in full rather than paged: with fifty therapists a
 * "top 10 by score" query cannot be built in SQL, because the score is computed in
 * application code. Evaluating every candidate is what makes the result independent
 * of any query's `take`, and therefore reproducible.
 */
export function runMatchEngine({
  intake,
  candidates,
  excludedTherapistIds = [],
  feedback = NO_FEEDBACK_SIGNALS,
}: MatchEngineInput): MatchEngineOutput {
  const signals = toClientSignals(intake);
  const excluded = new Set(excludedTherapistIds);

  // Stage 3, then 4 to 7 in one pass per candidate.
  const evaluated: CandidateEvaluation[] = [];
  const trace: CandidateTrace[] = [];
  let availabilityUncomparable = false;

  for (const candidate of candidates) {
    if (excluded.has(candidate.id)) {
      // Stage 0, effectively. Evaluated enough to be recorded, and recorded as a
      // decision rather than an absence — see `evaluateExclusions`.
      evaluated.push(exclusionFor(candidate));
      trace.push(toTrace(exclusionFor(candidate)));
      continue;
    }

    const { evaluation, availabilityUncomparable: uncomputable } = evaluateCandidate(
      signals,
      candidate,
      feedback,
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
  // promotion is applied to the list as well as returned separately, so the rows that
  // get persisted and the row the API answers with cannot be different ones.
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
    feedback,
  };
}

/**
 * A candidate this journey has already declined.
 *
 * Recorded with a score of zero and a rejection code, exactly like a candidate that
 * failed a requirement. The alternative — dropping it from the list — would make a
 * declined therapist indistinguishable from one who was never considered, and this
 * engine's entire claim is that every decision is inspectable. A person who said "not
 * this one" made a decision, and that decision is part of the record.
 *
 * The score is zero rather than the score it would have earned, because a score is an
 * ordering aid and a candidate that is not being ordered must not appear to have
 * competed.
 */
function exclusionFor(candidate: CandidateTherapist): CandidateEvaluation {
  return {
    therapistId: candidate.id,
    displayName: candidate.displayName,
    status: 'INELIGIBLE',
    rejectionCode: 'DECLINED_PREVIOUSLY',
    score: 0,
    evidence: [],
    requirements: [],
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
