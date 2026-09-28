import type { FeedbackRepository } from './feedbackRepository.js';
import { toFeedbackSignals, NO_FEEDBACK_SIGNALS } from './feedbackSignals.js';
import type { ChangeNote, ComparisonSide } from './feedbackTypes.js';
import { describeChange } from './whatChanged.js';
import type { ExplanationVocabulary } from './explanations.js';
import type { MatchCategory, MatchEvidenceInput } from './matchingTypes.js';

/**
 * Reading two recommendations back and saying what differs.
 *
 * `whatChanged.ts` is pure — it takes two fully-formed comparisons and decides what can
 * be said. This module is the I/O around it, and it exists as its own file so that the
 * two callers that need it — the recommendation being read, and the rematch that just
 * produced one — cannot disagree about how a comparison is built. A second copy of this
 * logic is how "what changed" starts saying things the record does not support.
 *
 * ## Everything is read back from storage
 *
 * Not one value is taken from an engine return value. That is the same rule the
 * explanations follow, and for the same reason: a mapping mistake between what was
 * computed and what was stored would produce a page the stored record contradicts, and
 * nobody would find out until a person asked why.
 *
 * ## An absent comparison is a small gap; a fabricated one is the failure
 *
 * If either side cannot be read — a previous pass with no rows, a therapist whose
 * profile will not load, a match with no feedback recorded against it — the answer is
 * an empty list. "What changed this time" is the section a reader is most likely to
 * believe, and padding it with a plausible sentence is worse than leaving it out.
 */
export async function readChangeNotes(
  previousMatchId: string,
  currentMatchId: string,
  feedback: FeedbackRepository,
  vocabulary: ExplanationVocabulary,
  /**
   * What the client asked for, from the intake.
   *
   * A caller that cannot read the intake passes an empty record, and the section is
   * then limited to differences with nothing to measure them against — which is a gap,
   * not a guess. The alternative, inferring the preference from a match, is wrong in the
   * exact case that matters: a person who asked for exploratory and was given direct
   * leaves no style evidence at all.
   */
  stated: Readonly<Record<MatchCategory, readonly string[]>>,
): Promise<readonly ChangeNote[]> {
  const [previousEvidence, currentEvidence, previousHeader, currentHeader] = await Promise.all([
    feedback.readMatchEvidence(previousMatchId),
    feedback.readMatchEvidence(currentMatchId),
    feedback.findMatch(previousMatchId),
    feedback.findMatch(currentMatchId),
  ]);

  // A pass that recommended nobody has no evidence, and there is nothing to compare it
  // with. An empty section is the honest rendering of that.
  if (previousEvidence.length === 0 || currentEvidence.length === 0) {
    return [];
  }

  if (previousHeader === null || currentHeader === null) {
    return [];
  }

  const [before, after] = await Promise.all([
    feedback.readComparisonCandidate(previousHeader.therapistId),
    feedback.readComparisonCandidate(currentHeader.therapistId),
  ]);

  if (before === null || after === null) {
    return [];
  }

  return describeChange(
    toSide(previousHeader.matchId, previousHeader.therapistId, before, previousEvidence),
    toSide(currentHeader.matchId, currentHeader.therapistId, after, currentEvidence),
    // What the person said about the *previous* recommendation. A pass nobody left a
    // note on has touched nothing, so the section is empty — and that is correct: the
    // page must not imply we took something into account that we did not.
    await signalsFor(feedback, previousMatchId),
    vocabulary,
    stated,
  );
}

/**
 * The signals recorded against a match, or none.
 *
 * Read from the feedback row rather than reconstructed. There is one rule set —
 * `toFeedbackSignals` — and a second attempt to infer what someone meant from their
 * match history is exactly the kind of guess this product does not make.
 */
async function signalsFor(
  feedback: FeedbackRepository,
  matchId: string,
): Promise<ReturnType<typeof toFeedbackSignals>> {
  const stored = await feedback.findFeedback(matchId);

  return stored === null ? NO_FEEDBACK_SIGNALS : toFeedbackSignals(stored.reasonKeys);
}

function toSide(
  matchId: string,
  therapistId: string,
  candidate: NonNullable<Awaited<ReturnType<FeedbackRepository['readComparisonCandidate']>>>,
  evidence: readonly MatchEvidenceInput[],
): ComparisonSide {
  return {
    matchId,
    therapistId,
    displayName: candidate.displayName,
    evidence,
    attributes: {
      areasOfWork: candidate.areasOfWork,
      communicationStyles: candidate.communicationStyles,
      approaches: candidate.approaches,
      contextualExperience: candidate.contextualExperience,
      languages: candidate.languages,
      sessionFormats: candidate.sessionFormats,
    },
  };
}
