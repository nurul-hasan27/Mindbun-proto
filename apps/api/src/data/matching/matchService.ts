import { DataStoreUnavailableError } from '../storeErrors.js';
import { runMatchEngine } from './matchEngine.js';
import { explainAll, type ExplanationVocabulary } from './explanations.js';
import { prioritiseEvidence } from './prioritise.js';
import { readChangeNotes } from './changeNotes.js';
import { statedPreferences } from './signals.js';
import type { ChangeNote } from './feedbackTypes.js';
import type { MatchCategory } from './matchingTypes.js';
import type { RecommendationBody } from './recommendationTypes.js';
import type { FeedbackRepository } from './feedbackRepository.js';
import type { MatchEvidenceInput } from './matchingTypes.js';
import type { MatchRepository, StoredRun } from './matchRepository.js';
import type { TherapistRepository } from '../therapists/therapistRepository.js';

/**
 * The use case: one intake in, one recommendation and its reasons out.
 *
 * Everything the brief asked for is here, in order, and nothing else is:
 *
 * 1. read the intake
 * 2. ask the engine
 * 3. persist every candidate, not just the winner
 * 4. read the evidence back from storage
 * 5. prioritise it and turn it into sentences
 *
 * Step 4 is not redundant. Reading the explanations from the rows that were just
 * written, rather than from the objects the engine returned, is what proves the
 * record and the page agree — if a mapping between the two were ever wrong, the page
 * would be wrong in exactly the way the stored record says it should not be, and a
 * test would catch it rather than a person.
 *
 * ## A recommendation is the *latest* pass, not the first
 *
 * Worth being explicit about, because getting it backwards is not a subtle bug: it
 * shows someone the person they have just turned down. After a rematch the current
 * recommendation is the newest pass, so that is what "give me a recommendation for
 * this intake" answers with. The earlier passes are the history and stay exactly where
 * they are.
 *
 * ## Why the response shape carries the rematch fields
 *
 * `attempt`, `previousTherapistName` and `whatChanged` are present on a first match
 * too, as `1`, `null` and `[]`.
 *
 * The alternative — a narrower first-match response and a wider rematch one — is
 * tempting, and it is worse. A page that has to work out which shape it got, and which
 * is correct in one case and quietly renders nothing in the other, is a page that will
 * eventually show a person nothing at all. A uniform shape makes the *absence* of a
 * change something to be read rather than something to be inferred from a missing
 * field, and it lets a refresh of the recommendation page show the rematch correctly
 * with no second request.
 */

export type RecommendationOutcome =
  | ({ readonly kind: 'recommended' } & RecommendationBody)
  | {
      readonly kind: 'no-candidate';
      /** How many were considered, which is a fact and not a number to boast about. */
      readonly considered: number;
    };

export type RecommendOutcome =
  | { readonly kind: 'found'; readonly result: RecommendationOutcome }
  | { readonly kind: 'unknown-intake' };

export interface RecommendDeps {
  readonly matches: MatchRepository;
  readonly therapists: TherapistRepository;
  /**
   * Only needed to answer "what changed" after a rematch.
   *
   * A caller with no feedback store can still get a first match, and `whatChanged`
   * will be empty. It cannot be faked, so its absence is a gap rather than a lie.
   */
  readonly feedback?: FeedbackRepository;
}

export async function recommendTherapist(
  intakeId: string,
  { matches, therapists, feedback }: RecommendDeps,
): Promise<RecommendOutcome> {
  const matchable = await matches.loadMatchableIntake(intakeId);

  if (matchable === null) {
    return { kind: 'unknown-intake' };
  }

  // An existing pass for this intake is the answer, returned unchanged. The engine is
  // deterministic, so running it again could not produce a different one — and writing
  // a second pass at the same number would imply it might. Asking for another option is
  // a *different* request, with a different endpoint, and it writes the next pass
  // without touching this one.
  const existing = await matches.findLatestRun(intakeId);

  if (existing !== null) {
    return {
      kind: 'found',
      result: await describe(existing, matches, therapists, feedback),
    };
  }

  const candidates = await matches.listCandidates();
  const { result } = runMatchEngine({ intake: matchable.intake, candidates });

  const saved = await matches.saveRun({
    intakeId: matchable.intakeId,
    clientId: matchable.clientId,
    attempt: 1,
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

  return { kind: 'found', result: await describe(saved, matches, therapists, feedback) };
}

/**
 * Read the evidence back out of storage, then prioritise and phrase it.
 *
 * Deliberately reading from the rows that were just written, rather than from the
 * objects the engine returned: that is what proves the record and the page agree.
 * A mapping mistake between the two would otherwise produce a page the stored record
 * contradicts, and nobody would find out until a person asked why.
 */
async function describe(
  run: StoredRun,
  matches: MatchRepository,
  therapists: TherapistRepository,
  feedback: FeedbackRepository | undefined,
): Promise<RecommendationOutcome> {
  const stored = run.recommendation;

  if (stored === null) {
    return { kind: 'no-candidate', considered: run.considered };
  }

  const [names, therapist] = await Promise.all([
    matches.readVocabularyNames(),
    therapists.findById(stored.therapistId),
  ]);

  if (therapist === null) {
    // Only reachable if a therapist were deleted between the run and the read. A
    // recommendation that cannot name its person is not a recommendation.
    throw new DataStoreUnavailableError('The recommended therapist could not be read.');
  }

  const vocabulary: ExplanationVocabulary = { names };
  const shown: readonly MatchEvidenceInput[] = prioritiseEvidence(stored.evidence);

  const { previousTherapistName, whatChanged, adjustedFor } = await context(
    run,
    stored.matchId,
    matches,
    therapists,
    feedback,
    vocabulary,
  );

  return {
    kind: 'recommended',
    matchId: stored.matchId,
    attempt: run.attempt,
    therapist,
    evidence: explainAll(shown, vocabulary),
    previousTherapistName,
    whatChanged,
    // A first match is adjusted for nothing, and says so. A rematch was adjusted for
    // whatever the client said about the pass before, which is the same list the "what
    // changed" comparison reads — so the page can show the cause and the effect from
    // one source rather than two.
    adjustedFor: adjustedFor,
    decidedAt: stored.createdAt,
  };
}

/**
 * The two things a rematch has that a first match does not.
 *
 * Named rather than written inline, because an inline `Promise<{ ... }>` return type
 * runs into its own closing brackets and reads badly besides.
 */
interface RematchContext {
  readonly previousTherapistName: string | null;
  readonly whatChanged: readonly ChangeNote[];
  readonly adjustedFor: readonly string[];
}

/**
 * What to measure a difference against when the intake cannot be read.
 *
 * Nothing, rather than a guess. Every category empty means the comparison can still say
 * that two therapists differ, and cannot say either is closer to anything — which is
 * the correct limit when the only record of what the client wanted is unavailable.
 */
const NO_STATED_PREFERENCES: Readonly<Record<MatchCategory, readonly string[]>> = {
  AREA_OF_WORK: [],
  COMMUNICATION_STYLE: [],
  THERAPEUTIC_APPROACH: [],
  CONTEXTUAL_EXPERIENCE: [],
  LANGUAGE: [],
  SESSION_FORMAT: [],
  AVAILABILITY: [],
};

async function context(
  run: StoredRun,
  currentMatchId: string,
  matches: MatchRepository,
  therapists: TherapistRepository,
  feedback: FeedbackRepository | undefined,
  vocabulary: ExplanationVocabulary,
): Promise<RematchContext> {
  if (run.attempt <= 1 || feedback === undefined) {
    return { previousTherapistName: null, whatChanged: [], adjustedFor: [] };
  }

  const previous = await matches.findPreviousRun(run.intakeId, run.attempt);

  // No pass before this one, despite the attempt number claiming otherwise. The record
  // is inconsistent, and an inconsistent record is a gap rather than something to
  // improvise around.
  if (previous?.recommendation == null) {
    return { previousTherapistName: null, whatChanged: [], adjustedFor: [] };
  }

  const therapist = await therapists.findById(previous.recommendation.therapistId);

  // What the client said about the pass before, and what they asked for at intake. Both
  // read rather than reconstructed, so there is exactly one rule set in the codebase for
  // each — and the second is the one that makes "more exploratory" sayable at all.
  const [storedFeedback, matchable] = await Promise.all([
    feedback.findFeedback(previous.recommendation.matchId),
    matches.loadMatchableIntake(run.intakeId),
  ]);

  return {
    // By name, and only because the client saw them. No identifier, and no other
    // attribute of theirs: this line says "not that person", nothing more.
    previousTherapistName: therapist?.displayName ?? null,
    whatChanged: await readChangeNotes(
      previous.recommendation.matchId,
      currentMatchId,
      feedback,
      vocabulary,
      // Empty rather than invented when the intake cannot be read: the comparison then
      // describes only differences with nothing to measure them against, which is a
      // smaller claim than the one it would otherwise make.
      matchable === null ? NO_STATED_PREFERENCES : statedPreferences(matchable.intake),
    ),
    adjustedFor: storedFeedback === null ? [] : [...storedFeedback.reasonKeys],
  };
}
