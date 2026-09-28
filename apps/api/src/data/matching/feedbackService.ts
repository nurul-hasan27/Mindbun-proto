import { DataStoreUnavailableError } from '../storeErrors.js';
import { toFeedbackSignals } from './feedbackSignals.js';
import type { FeedbackReasonKey, FeedbackReceipt, RematchContext } from './feedbackTypes.js';
import type { FeedbackRepository } from './feedbackRepository.js';
import { runMatchEngine } from './matchEngine.js';
import { explainAll, type ExplanationVocabulary } from './explanations.js';
import { prioritiseEvidence } from './prioritise.js';
import type { MatchEvidenceInput } from './matchingTypes.js';
import type { MatchRepository } from './matchRepository.js';
import { readChangeNotes } from './changeNotes.js';
import { statedPreferences } from './signals.js';
import type { RecommendationBody } from './recommendationTypes.js';
import type { TherapistRepository } from '../therapists/therapistRepository.js';

/**
 * What happens after a recommendation is turned down.
 *
 * Three steps, in this order, and the order is the design:
 *
 * 1. **Record what was said.** Feedback and the match's new status in one transaction, so
 *    the promise made to the person and the state the search will read cannot disagree.
 * 2. **Ask whether to look again.** The person chooses. A declined match is recorded
 *    whether or not they ever request a second one, because "not this one" is a
 *    decision in its own right and the record should hold it either way.
 * 3. **Look again, differently.** Same engine, different inputs — a larger exclusion set
 *    and adjusted weights. Not a second engine, and no code path here that could disagree
 *    with the first about what the best candidate is.
 *
 * ## Nothing the browser sends is believed
 *
 * Both requests carry a `matchId` and nothing else. The client, the therapist, the
 * intake, the exclusion set, the pass number and the weights are all derived here from
 * what is already stored. A browser cannot name a therapist to exclude, cannot submit a
 * weight, cannot target another person's match, and cannot ask for a specific person —
 * because there is no field through which any of those could arrive.
 *
 * ## What "different" means, exactly
 *
 * The next person is different in two ways, and only two: everyone already declined on
 * this intake is gone, and the categories the feedback mentioned count for more. The
 * first is a set difference; the second is a re-weighting with a ceiling. Neither is a
 * new rule about the client, and neither is persisted as one.
 */

export type FeedbackOutcome =
  | { readonly kind: 'recorded'; readonly receipt: FeedbackReceipt }
  | { readonly kind: 'unknown-match' }
  | { readonly kind: 'already-declined' };

export interface RecordDeps {
  readonly feedback: FeedbackRepository;
}

export async function recordFeedback(
  matchId: string,
  request: { readonly reasons: readonly FeedbackReasonKey[]; readonly rawText?: string },
  { feedback }: RecordDeps,
): Promise<FeedbackOutcome> {
  const header = await feedback.findMatch(matchId);

  if (header === null) {
    return { kind: 'unknown-match' };
  }

  // Declining the same recommendation twice is not a second opinion, it is a double
  // click or a retried request. Answering with the first answer is the honest reply,
  // and `matchId` being unique on `feedback` is what makes it one row.
  if (header.status === 'DECLINED') {
    const existing = await feedback.findFeedback(matchId);

    if (existing !== null) {
      return {
        kind: 'recorded',
        receipt: {
          feedbackId: existing.id,
          matchId,
          reasons: existing.reasonKeys,
          recordedAt: existing.recordedAt,
        },
      };
    }

    return { kind: 'already-declined' };
  }

  const known = new Set((await feedback.readReasons()).map((reason) => reason.key));
  const accepted = request.reasons.filter((key) => known.has(key));

  const stored = await feedback.recordFeedback({
    matchId,
    // Only the reasons the vocabulary actually holds. A browser cannot invent a signal
    // by sending a key that does not exist, and it cannot smuggle one in by sending a
    // real key with a payload attached.
    reasons: accepted,
    rawText: normaliseText(request.rawText),
  });

  return {
    kind: 'recorded',
    receipt: {
      feedbackId: stored.id,
      matchId: stored.matchId,
      reasons: stored.reasonKeys,
      recordedAt: stored.recordedAt,
    },
  };
}

export type RematchOutcome =
  /**
   * The same `RecommendationBody` a first match produces.
   *
   * Not a similar shape — the same one. The first match and the rematch are the same
   * thing with different inputs, and the only honest way for that to survive into the
   * interface is for there to be one type and one serialiser behind both.
   */
  | ({ readonly kind: 'rematched' } & RecommendationBody)
  | {
      readonly kind: 'no-candidate';
      /**
       * How many were left, which is the whole story on a page that says "we've run
       * out". A count of people, never a count of score.
       */
      readonly remaining: number;
    }
  | { readonly kind: 'unknown-match' }
  | { readonly kind: 'no-feedback' }
  | { readonly kind: 'already-looked-again' };

export interface RematchDeps extends RecordDeps {
  readonly matches: MatchRepository;
  readonly therapists: TherapistRepository;
}

export async function requestRematch(matchId: string, deps: RematchDeps): Promise<RematchOutcome> {
  const context = await deps.feedback.loadRematchContext(matchId);

  if (context === null) {
    return { kind: 'unknown-match' };
  }

  // Looking again twice from the same match is a retry, and the first answer is the
  // answer.
  if (context.hasLaterAttempt) {
    return { kind: 'already-looked-again' };
  }

  if (!context.hasFeedback) {
    // Rematching without a reason is the one thing this phase exists to avoid: it is
    // how "show me someone else" becomes an endless shuffle through the list.
    return { kind: 'no-feedback' };
  }

  const stored = await deps.feedback.findFeedback(matchId);

  if (stored === null) {
    return { kind: 'no-feedback' };
  }

  const signals = toFeedbackSignals(stored.reasonKeys);
  const matchable = await deps.matches.loadMatchableIntake(context.intakeId);

  if (matchable === null) {
    return { kind: 'unknown-match' };
  }

  // The exclusion set, in one place, from stored state only: everyone already declined
  // on this intake. It includes the match being replaced, so there is no path by which
  // the same person comes back.
  const excluded = new Set(context.declinedTherapistIds);
  excluded.add(context.therapistId);

  const candidates = await deps.matches.listCandidates();

  // No short-circuit on an exhausted pool. The engine runs anyway, with the full
  // candidate list and the exclusion set, and every candidate comes back ineligible
  // with `DECLINED_PREVIOUSLY`. That is better on every axis than returning early: the
  // pass is a full record rather than a gap, there is one code path instead of two
  // that could disagree, and the "we looked and there was nobody" outcome falls out of
  // the engine rather than being special-cased.
  const remaining = candidates.filter((candidate) => !excluded.has(candidate.id)).length;

  const { result } = runMatchEngine({
    intake: matchable.intake,
    candidates,
    excludedTherapistIds: [...excluded],
    feedback: signals,
  });

  const saved = await deps.matches.saveRun({
    intakeId: context.intakeId,
    clientId: context.clientId,
    attempt: context.nextAttempt,
    engineVersion: result.engineVersion,
    evaluations: result.candidates.map((candidate, ordinal) => ({
      therapistId: candidate.therapistId,
      status: candidate.status,
      rejectionCode: candidate.rejectionCode,
      score: candidate.score,
      evidence: candidate.evidence,
      ordinal,
    })),
  });

  const recommended = saved.recommendation;

  if (recommended === null) {
    return { kind: 'no-candidate', remaining };
  }

  const [names, therapist] = await Promise.all([
    deps.matches.readVocabularyNames(),
    deps.therapists.findById(recommended.therapistId),
  ]);

  if (therapist === null) {
    throw new DataStoreUnavailableError('The recommended therapist could not be read.');
  }

  const vocabulary: ExplanationVocabulary = { names };
  const shown: readonly MatchEvidenceInput[] = prioritiseEvidence(recommended.evidence);
  // The same helper the recommendation page uses, so a page loaded by refresh and a page
  // loaded straight from this response cannot say different things about the same pair
  // of people.
  const whatChanged = await readChangeNotes(
    matchId,
    recommended.matchId,
    deps.feedback,
    vocabulary,
    // Straight from the intake. What the client asked for is a fact about them, not
    // about either of the two people being compared.
    statedPreferences(matchable.intake),
  );

  // The previous name comes from the same read the page already has — the header of
  // the match being replaced. No second lookup, and nothing else about that person.
  const previous = await deps.therapists.findById(context.therapistId);

  return {
    kind: 'rematched',
    matchId: recommended.matchId,
    decidedAt: recommended.createdAt,
    attempt: context.nextAttempt,
    therapist,
    evidence: explainAll(shown, vocabulary),
    previousTherapistName: previous?.displayName ?? null,
    whatChanged,
    adjustedFor: signals.reasonKeys,
  };
}

/**
 * A note, in someone's own words, or null.
 *
 * Trimmed and length-capped, and never logged. The cap is not arbitrary: a person who
 * writes four pages is not describing a match, they are describing their week, and
 * storing all of it would be keeping something we have no use for and no way to act on.
 */
function normaliseText(text: string | undefined): string | null {
  if (text === undefined) {
    return null;
  }

  const trimmed = text.trim();

  if (trimmed === '') {
    return null;
  }

  return trimmed.slice(0, 2_000);
}

export type { RematchContext };
