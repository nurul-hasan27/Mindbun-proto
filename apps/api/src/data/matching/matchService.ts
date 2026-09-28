import { DataStoreUnavailableError } from '../storeErrors.js';
import { runMatchEngine } from './matchEngine.js';
import type { Explanation } from './explanations.js';
import { explainAll, type ExplanationVocabulary } from './explanations.js';
import { prioritiseEvidence } from './prioritise.js';
import type { MatchEvidenceInput } from './matchingTypes.js';
import type { MatchRepository, StoredRun } from './matchRepository.js';
import type { TherapistRepository } from '../therapists/therapistRepository.js';
import type { TherapistProfileView } from '../therapists/therapistView.js';

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
 */

export type RecommendationOutcome =
  | {
      readonly kind: 'recommended';
      readonly matchId: string;
      readonly therapist: TherapistProfileView;
      readonly evidence: readonly Explanation[];
      /** ISO 8601, from the stored row rather than from a fresh clock reading. */
      readonly decidedAt: string;
    }
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
}

export async function recommendTherapist(
  intakeId: string,
  { matches, therapists }: RecommendDeps,
): Promise<RecommendOutcome> {
  const matchable = await matches.loadMatchableIntake(intakeId);

  if (matchable === null) {
    return { kind: 'unknown-intake' };
  }

  // A previous decision for this intake is the decision, returned unchanged. The
  // engine is deterministic, so running it again could not produce a different
  // answer — and writing a second set of rows would imply it might.
  const existing = await matches.findRun(intakeId);

  if (existing !== null) {
    return { kind: 'found', result: await describe(existing, matches, therapists) };
  }

  const candidates = await matches.listCandidates();
  const { result } = runMatchEngine({ intake: matchable.intake, candidates });

  const saved = await matches.saveRun({
    intakeId: matchable.intakeId,
    clientId: matchable.clientId,
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

  return { kind: 'found', result: await describe(saved, matches, therapists) };
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

  return {
    kind: 'recommended',
    matchId: stored.matchId,
    therapist,
    evidence: explainAll(shown, vocabulary),
    decidedAt: stored.createdAt,
  };
}
