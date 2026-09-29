import type { CandidateEvaluation } from './matchingTypes.js';

/**
 * Stage 8: deterministic ordering.
 *
 * Four keys, in order, and the last one is total. That is what makes the engine
 * reproducible: given the same candidates, two runs on two machines produce the
 * same order, and a stored `Match` can be re-derived and compared.
 *
 * | Key | Direction | Why |
 * | --- | --- | --- |
 * | score | descending | The compatibility figure. An ordering aid, nothing more. |
 * | requirements satisfied | descending | Between equal scores, the one who meets what the client *insisted* on beats the one who merely shares more interests. |
 * | evidence items | descending | Then the broader overlap. |
 * | therapist id | ascending | The tie-break that makes the order total. |
 *
 * On that last key: an id is arbitrary, and that is the point. Every key above it is
 * meaningful and two candidates can still tie on all of them, and something has to
 * decide — an arbitrary-but-fixed rule is better than an arbitrary-and-varying one,
 * because a stable order means the same intake always produces the same
 * recommendation, which is what a person asking "why this one?" is entitled to.
 *
 * Nothing random is used anywhere in this engine, and no clock is read.
 */

/** Candidates in the order the engine would consider them. */
export function orderCandidates(
  candidates: readonly CandidateEvaluation[],
): readonly CandidateEvaluation[] {
  return [...candidates].sort(
    (first, second) =>
      second.score - first.score ||
      satisfiedCount(second) - satisfiedCount(first) ||
      second.evidence.length - first.evidence.length ||
      first.therapistId.localeCompare(second.therapistId),
  );
}

function satisfiedCount(candidate: CandidateEvaluation): number {
  return candidate.requirements.filter((requirement) => requirement.satisfied).length;
}

/**
 * Stage 9: the candidate to show.
 *
 * The highest ordered eligible candidate. `null` when nothing survived, which is an
 * outcome the product has words for rather than an error.
 */
export function selectRecommendation(
  candidates: readonly CandidateEvaluation[],
): CandidateEvaluation | null {
  const eligible = candidates.filter((candidate) => candidate.status === 'ELIGIBLE');

  return orderCandidates(eligible)[0] ?? null;
}
