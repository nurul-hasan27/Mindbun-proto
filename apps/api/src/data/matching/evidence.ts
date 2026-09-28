import { findAvailabilityOverlaps, type AvailabilityOverlap } from './availability.js';
import type {
  CandidateEvaluation,
  CandidateTherapist,
  ClientSignals,
  MatchEvidenceInput,
  RejectionCode,
  RequirementOutcome,
  RequirementRule,
} from './matchingTypes.js';
import {
  AVAILABILITY_DAY_CAP,
  AVAILABILITY_PER_DAY,
  CATEGORY_EXPLANATION,
  CATEGORY_MAX_SCORE,
  REQUIREMENT_BONUS,
  categoryScore,
  strengthFor,
} from './weights.js';

/**
 * Stages 4 to 7 of the pipeline: does this candidate qualify, what is true about
 * them that overlaps, and what does that add up to.
 *
 * Each of the three is a function of its inputs alone and can be read top to
 * bottom. The arithmetic lives in `weights.ts`; this file is the matching.
 */

/** A requirement, resolved against one candidate. */
interface ResolvedRequirement {
  readonly outcome: RequirementOutcome;
  /** The keys that satisfied it, so they can be marked as requirements in the evidence. */
  readonly satisfiedKeys: readonly string[];
  readonly score: number;
}

/**
 * Stage 4: hard requirements.
 *
 * Returns the outcome of every rule, whether or not the candidate survived them all.
 * Keeping the failures is the point: a trace that says only "eliminated" is not an
 * explanation, and a future reviewer needs to see *which* condition was missed and
 * which keys were missing.
 */
export function evaluateRequirements(
  signals: ClientSignals,
  candidate: CandidateTherapist,
): readonly ResolvedRequirement[] {
  return signals.requirements.map((rule) => {
    const offered = offeredKeys(rule, candidate);
    const satisfiedKeys = rule.keys.filter((key) => offered.includes(key));
    const missing = rule.keys.filter((key) => !offered.includes(key));
    const satisfied =
      rule.quantifier === 'ANY_OF' ? satisfiedKeys.length > 0 : missing.length === 0;

    return {
      outcome: {
        ruleKey: rule.ruleKey,
        label: rule.label,
        satisfied,
        missing,
      },
      satisfiedKeys,
      score: satisfied ? REQUIREMENT_BONUS : 0,
    };
  });
}

/** The keys a therapist offers in a rule's category. */
function offeredKeys(rule: RequirementRule, candidate: CandidateTherapist): readonly string[] {
  switch (rule.category) {
    case 'LANGUAGE':
      return candidate.languages;
    case 'SESSION_FORMAT':
      return candidate.sessionFormats;
    case 'AREA_OF_WORK':
      return candidate.areasOfWork;
    case 'COMMUNICATION_STYLE':
      return candidate.communicationStyles;
    case 'THERAPEUTIC_APPROACH':
      return candidate.approaches;
    case 'CONTEXTUAL_EXPERIENCE':
      return candidate.contextualExperience;
    case 'AVAILABILITY':
      return [];
  }
}

/** The first unmet requirement, which is the only one worth reporting. */
function firstRejection(resolved: readonly ResolvedRequirement[]): RejectionCode | null {
  const unmet = resolved.find((entry) => !entry.outcome.satisfied);

  if (unmet === undefined) {
    return null;
  }

  return unmet.outcome.ruleKey === 'language' ? 'NO_SHARED_LANGUAGE' : 'NO_ACCEPTED_SESSION_FORMAT';
}

/**
 * Stage 5 and 6: preferences, and availability.
 *
 * Every overlap becomes one evidence item, and every evidence item names the keys it
 * came from. There is no aggregate "they match on 4 things" number anywhere, because
 * that would be the one claim nobody could check.
 *
 * The two cases worth reading closely:
 *
 * - **"I'm not sure yet"** (`openToGuidance`) suppresses communication-style
 *   evidence entirely. The client did not say style does not matter; they said they
 *   do not know yet, and counting a style against them would be answering a
 *   question they declined to answer.
 * - **Availability** produces one item per shared slot, capped in the *scoring* by
 *   `AVAILABILITY_DAY_CAP` but not in the evidence — the record holds every shared
 *   hour, because the record is for a reviewer and the cap is for an ordering.
 */
export function buildEvidence(
  signals: ClientSignals,
  candidate: CandidateTherapist,
  requirements: readonly ResolvedRequirement[],
): {
  readonly evidence: MatchEvidenceInput[];
  readonly score: number;
  /** True when a timezone could not be read, so no availability was compared. */
  readonly availabilityUncomparable: boolean;
} {
  // A key counts as required only when it is in a requirement rule *and* that rule
  // passed. The two halves matter: under a failing "all of these" rule no single key
  // is the one the client insisted on, because they insisted on the set. Such a
  // candidate is ineligible anyway, so this label is for the record and for a
  // reviewer — but the record should be accurate about what did and did not hold.
  const requiredKeys = new Set(
    requirements.filter((entry) => entry.outcome.satisfied).flatMap((entry) => entry.satisfiedKeys),
  );

  const evidence: MatchEvidenceInput[] = [];
  let score = 0;

  score += requirements.reduce((sum, entry) => sum + entry.score, 0);

  for (const key of intersection(signals.areasOfWork, candidate.areasOfWork)) {
    evidence.push(item('AREA_OF_WORK', key, key, requiredKeys));
  }
  score += categoryScore(
    CATEGORY_MAX_SCORE.AREA_OF_WORK,
    count(signals.areasOfWork, candidate.areasOfWork),
    signals.areasOfWork.length,
  );

  for (const key of intersection(signals.communicationStyles, candidate.communicationStyles)) {
    evidence.push(item('COMMUNICATION_STYLE', key, key, requiredKeys));
  }
  score += categoryScore(
    CATEGORY_MAX_SCORE.COMMUNICATION_STYLE,
    count(signals.communicationStyles, candidate.communicationStyles),
    signals.communicationStyles.length,
  );

  for (const key of intersection(signals.approaches, candidate.approaches)) {
    evidence.push(item('THERAPEUTIC_APPROACH', key, key, requiredKeys));
  }
  score += categoryScore(
    CATEGORY_MAX_SCORE.THERAPEUTIC_APPROACH,
    count(signals.approaches, candidate.approaches),
    signals.approaches.length,
  );

  for (const key of intersection(signals.contextualExperiences, candidate.contextualExperience)) {
    evidence.push(item('CONTEXTUAL_EXPERIENCE', key, key, requiredKeys));
  }
  score += categoryScore(
    CATEGORY_MAX_SCORE.CONTEXTUAL_EXPERIENCE,
    count(signals.contextualExperiences, candidate.contextualExperience),
    signals.contextualExperiences.length,
  );

  // A language that satisfied a requirement is a *required* language, and says so.
  // Any other shared language is a preference — real, but not what was insisted on.
  for (const key of intersection(signals.languages, candidate.languages)) {
    const isRequired = requiredKeys.has(key);
    evidence.push({
      category: 'LANGUAGE',
      strength: strengthFor(isRequired),
      clientKey: key,
      therapistKey: key,
      explanation: isRequired ? 'REQUIRED_LANGUAGE' : 'PREFERRED_LANGUAGE',
      weight: CATEGORY_MAX_SCORE.LANGUAGE,
    });
  }
  score += categoryScore(
    CATEGORY_MAX_SCORE.LANGUAGE,
    count(signals.languages, candidate.languages),
    signals.languages.length,
  );

  for (const key of intersection(signals.sessionFormats, candidate.sessionFormats)) {
    evidence.push(item('SESSION_FORMAT', key, key, requiredKeys));
  }
  score += categoryScore(
    CATEGORY_MAX_SCORE.SESSION_FORMAT,
    count(signals.sessionFormats, candidate.sessionFormats),
    signals.sessionFormats.length,
  );

  const availability = signals.availability;
  let availabilityUncomparable = false;

  if (availability !== null) {
    // One comparison, whose result feeds both the evidence and the flag: "we could
    // not read a timezone" and "there was no overlap" are different facts and only
    // one of them is a gap.
    const { overlaps, zonesUnresolvable } = findAvailabilityOverlaps(
      { timezone: availability.timezone, windows: availability.windows },
      { timezone: candidate.timezone, windows: candidate.availability },
    );

    availabilityUncomparable = zonesUnresolvable;

    for (const overlap of overlaps) {
      evidence.push(availabilityItem(overlap));
    }

    // Capped, so a therapist free every evening does not outrank a closer fit on
    // hours nobody books.
    score += Math.min(overlaps.length, AVAILABILITY_DAY_CAP) * AVAILABILITY_PER_DAY;
  }

  return { evidence: orderEvidence(evidence), score, availabilityUncomparable };
}

function item(
  category: MatchEvidenceInput['category'],
  clientKey: string,
  therapistKey: string,
  requiredKeys: ReadonlySet<string>,
): MatchEvidenceInput {
  const isRequired = requiredKeys.has(clientKey);

  return {
    category,
    strength: strengthFor(isRequired),
    clientKey,
    therapistKey,
    explanation: CATEGORY_EXPLANATION[category],
    weight: CATEGORY_MAX_SCORE[category],
  };
}

function availabilityItem(overlap: AvailabilityOverlap): MatchEvidenceInput {
  return {
    category: 'AVAILABILITY',
    strength: 'PREFERENCE',
    // Availability has no vocabulary key, so the identifying value is the client's
    // own wall-clock slot. It is a fact about a week, not a term in a list.
    clientKey: `${overlap.client.dayOfWeek} ${overlap.client.startMinute}-${overlap.client.endMinute}`,
    therapistKey: `${overlap.therapist.dayOfWeek} ${overlap.therapist.startMinute}-${overlap.therapist.endMinute}`,
    explanation: 'AVAILABILITY_OVERLAP',
    weight: AVAILABILITY_PER_DAY,
    overlap: {
      dayOfWeek: overlap.client.dayOfWeek,
      startMinute: overlap.client.startMinute,
      endMinute: overlap.client.endMinute,
      therapistDayOfWeek: overlap.therapist.dayOfWeek,
      therapistStartMinute: overlap.therapist.startMinute,
      therapistEndMinute: overlap.therapist.endMinute,
      weeks: overlap.weeks,
    },
  };
}

/**
 * A fixed order for the evidence, so a stored row order and a read row order agree.
 *
 * Requirements first, then the engine's own category order, then by key. The last
 * tiebreak is what makes it a *total* order: two items with the same category and
 * the same strength can never swap places between runs.
 */
function orderEvidence(evidence: MatchEvidenceInput[]): MatchEvidenceInput[] {
  const categoryOrder = Object.keys(CATEGORY_MAX_SCORE) as MatchEvidenceInput['category'][];

  return [...evidence].sort(
    (first, second) =>
      rank(first.strength) - rank(second.strength) ||
      categoryOrder.indexOf(first.category) - categoryOrder.indexOf(second.category) ||
      first.clientKey.localeCompare(second.clientKey) ||
      first.therapistKey.localeCompare(second.therapistKey),
  );
}

function rank(strength: MatchEvidenceInput['strength']): number {
  return strength === 'REQUIREMENT' ? 0 : 1;
}

/** Keys the client named that the therapist also offers, client order preserved. */
function intersection(asked: readonly string[], offered: readonly string[]): readonly string[] {
  return asked.filter((key) => offered.includes(key));
}

function count(asked: readonly string[], offered: readonly string[]): number {
  return intersection(asked, offered).length;
}

/**
 * Stages 4 to 7 for one candidate, in one call.
 *
 * Thin on purpose: the engine's job is to be a sequence of small, separately
 * testable steps, and this is the seam between them and the caller. Everything it
 * does can be read by calling the three functions above directly.
 */
export function evaluateCandidate(
  signals: ClientSignals,
  candidate: CandidateTherapist,
): {
  readonly evaluation: CandidateEvaluation;
  readonly availabilityUncomparable: boolean;
} {
  const requirements = evaluateRequirements(signals, candidate);
  const rejectionCode = firstRejection(requirements);
  const { evidence, score, availabilityUncomparable } = buildEvidence(
    signals,
    candidate,
    requirements,
  );

  return {
    evaluation: {
      therapistId: candidate.id,
      displayName: candidate.displayName,
      status: rejectionCode === null ? 'ELIGIBLE' : 'INELIGIBLE',
      rejectionCode,
      score: rejectionCode === null ? score : 0,
      evidence,
      requirements: requirements.map((entry) => entry.outcome),
    },
    availabilityUncomparable,
  };
}
