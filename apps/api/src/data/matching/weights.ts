import type { MatchCategory, MatchExplanation, PreferenceStrength } from './matchingTypes.js';

/**
 * The arithmetic, in one place, with the reasoning attached.
 *
 * ## What this is not
 *
 * These numbers are **not clinically validated, not evidence-based, and not a
 * measure of any person.** They are a prototype heuristic: a way to order
 * candidates that is inspectable and reproducible. Nobody studied them. A therapist
 * with a high score is not a better therapist, and a low score is not a judgement
 * about a person — it says only that this particular set of structured attributes
 * overlapped less with what one person asked for on one day.
 *
 * That is why the score is never sent to a client, never displayed, and never
 * described. It exists so that a recommendation's *ordering* can be traced back to
 * the evidence that produced it. The evidence is the product; the number is the
 * bookkeeping.
 *
 * ## The scheme
 *
 * Two parts, and only two.
 *
 * **1. Requirements are flat.** A satisfied requirement is worth a fixed amount,
 * `REQUIREMENT_BONUS`, and there are at most two of them. Flat because a
 * requirement is not a matter of degree: a session in a shared language either
 * happens or it does not, and half-credit for it would be a strange thing to show
 * anyone. The amount is set above the sum of every category maximum, so satisfying
 * a requirement always outranks the entire preference field — a candidate who meets
 * what the client insisted on is a better answer than one who happens to share more
 * interests, however many interests there are.
 *
 * **2. Preferences are a proportion, capped.** For each category the client
 * actually asked about, the contribution is:
 *
 * ```text
 * floor( MAX_CATEGORY_SCORE × matchedKeys / keysTheClientChose )
 * ```
 *
 * A *proportion* rather than a per-key sum, so "matches three of the three areas
 * you named" cannot be beaten by "matches six of the six areas you named" just by
 * asking more. Capped at `MAX_CATEGORY_SCORE`, so no category can dominate.
 *
 * Both are integer arithmetic. There is no floating point in the scoring path at
 * all, so a score cannot drift between two runs on different hardware — the whole
 * point of a number that is supposed to be reproducible.
 */

/**
/**
 * The most any one category can count for, as a multiple of its base.
 *
 * Feedback can raise a preference's importance, and a boost with no ceiling would let
 * one sentence outweigh everything else. Two times the base is enough to make a
 * mentioned preference outrank an unmentioned one — which is the whole intent — and not
 * enough to turn a preference into something that behaves like a requirement.
 *
 * `maxCategoryScore` enforces it, and `REQUIREMENT_BONUS` is set above the largest total
 * this can possibly produce, so the invariant "a requirement outranks every preference
 * put together" survives a rematch. Both are asserted by tests rather than assumed.
 */
export const FEEDBACK_BOOST_CEILING = 2;

/**
 * What a satisfied requirement is worth, above everything else combined.
 *
 * Deliberately larger than the largest total the preference field can reach *after* any
 * feedback, so the property is arithmetic rather than a hope: a candidate who meets what
 * the client insisted on always outranks a candidate who merely shares more interests,
 * however many interests there are and however much they have been boosted. A test
 * asserts the inequality against the boosted maximum, not the base one.
 */
export const REQUIREMENT_BONUS = 600;

/**
 * The most each category of preference can contribute, chosen to encode a stated
 * ordering of what a person most often means.
 *
 * Areas of work and lived context come first because "I want help with this" and
 * "you have been here too" are the two things people most often mean when they
 * answer a matching form. Style next. A shared approach is a description of method
 * rather than of fit, so it counts for less. A preferred language counts for less
 * than a required one but is still a real signal, and — the exception worth naming
 * — it is *not* discounted below session format, because someone who would rather
 * speak Tamil is telling you something specific.
 *
 * Session format is last because it is the weakest signal in the dataset: this
 * phase does not do geographic matching, so "in person" is recorded and unused.
 * Availability is a separate line, below.
 */
export const CATEGORY_MAX_SCORE: Readonly<Record<MatchCategory, number>> = {
  AREA_OF_WORK: 50,
  CONTEXTUAL_EXPERIENCE: 50,
  COMMUNICATION_STYLE: 40,
  THERAPEUTIC_APPROACH: 30,
  LANGUAGE: 30,
  SESSION_FORMAT: 20,
  // Availability has no client-key denominator: a person who said "weekday
  // evenings" has said everything there is to say, and every extra shared evening
  // is not a closer fit. So it is scored per shared day, to a ceiling.
  AVAILABILITY: 0,
};

/** What one shared day or evening of availability is worth. */
export const AVAILABILITY_PER_DAY = 20;

/**
 * The ceiling on availability.
 *
 * Three shared days is already "we could probably arrange something", and the
 * ceiling stops a therapist who is free every evening from beating a closer fit on
 * the strength of hours nobody can book. Set to allow for a full working week of
 * shared evenings.
 */
export const AVAILABILITY_DAY_CAP = 3;

/** Which explanation a shared key in each category earns. */
export const CATEGORY_EXPLANATION: Readonly<Record<MatchCategory, MatchExplanation>> = {
  AREA_OF_WORK: 'AREA_OF_WORK',
  LANGUAGE: 'PREFERRED_LANGUAGE',
  COMMUNICATION_STYLE: 'COMMUNICATION_STYLE',
  THERAPEUTIC_APPROACH: 'THERAPEUTIC_APPROACH',
  CONTEXTUAL_EXPERIENCE: 'CONTEXTUAL_EXPERIENCE',
  SESSION_FORMAT: 'SESSION_FORMAT',
  AVAILABILITY: 'AVAILABILITY_OVERLAP',
};

/**
 * How strongly each explanation is shown, lowest number first.
 *
 * The order a client reads reasons in, and it follows `CATEGORY_MAX_SCORE` down the
 * tiers: requirements first, then the preferences strongest first, then the two
 * weak signals.
 *
 * | Tier | Explanations | Why |
 * | --- | --- | --- |
 * | 1 | `REQUIRED_LANGUAGE` | A condition the client insisted on, and the only thing here that is not a matter of taste. It is the reason to believe the rest. |
 * | 2 | `AREA_OF_WORK`, `CONTEXTUAL_EXPERIENCE`, `COMMUNICATION_STYLE`, `THERAPEUTIC_APPROACH`, `PREFERRED_LANGUAGE` | The preferences, strongest first by category weight: what people most often mean when they answer a matching form. |
 * | 3 | `AVAILABILITY_OVERLAP` | Genuinely useful, but a rough sense of a week. |
 * | 4 | `SESSION_FORMAT` | The lowest score of any category, and this phase does no geographic matching, so "in person" is recorded and unused. |
 *
 * Availability sits late on purpose: a recommendation whose reasons are mostly about
 * evenings is a recommendation about scheduling.
 *
 * **Session format is a subtlety worth reading twice.** Its score is the lowest of
 * any category, and this table would display it last — except that the intake always
 * treats a chosen format as a requirement (see `deriveRequirements`), so any
 * session-format reason the page shows is a **requirement**, sorted into tier 1 by
 * strength rather than by this table. That is right: someone who said "online only"
 * wants to know the practical thing will work before they want to hear about areas of
 * work. The two rules do not conflict. Strength answers "was this insisted on", this
 * table answers "how interesting is it", and a requirement is interesting whatever it
 * happens to be.
 *
 * Documented here so the order can be argued with rather than guessed at.
 */
export const EXPLANATION_PRIORITY: Readonly<Record<MatchExplanation, number>> = {
  REQUIRED_LANGUAGE: 10,
  AREA_OF_WORK: 20,
  CONTEXTUAL_EXPERIENCE: 30,
  COMMUNICATION_STYLE: 40,
  THERAPEUTIC_APPROACH: 50,
  PREFERRED_LANGUAGE: 60,
  AVAILABILITY_OVERLAP: 70,
  SESSION_FORMAT: 80,
};

/**
 * How many reasons a client is shown.
 *
 * Three to five is the brief, and the ceiling is the real constraint: a list of
 * every overlapping attribute is not an explanation, it is a data dump that makes
 * the person do the ranking. The engine records all of it; the product shows this
 * much.
 */
export const MAX_SHOWN_EVIDENCE = 5;

/** How many of each thing may be *shown*, so one category cannot fill the list. */
export const MAX_SHOWN_PER_CATEGORY: Readonly<Record<MatchCategory, number>> = {
  AREA_OF_WORK: 2,
  LANGUAGE: 2,
  COMMUNICATION_STYLE: 1,
  THERAPEUTIC_APPROACH: 1,
  CONTEXTUAL_EXPERIENCE: 2,
  SESSION_FORMAT: 1,
  AVAILABILITY: 2,
};

/**
 * The most a category can contribute, with any feedback boost applied and capped.
 *
 * The cap is what stops a boost becoming a requirement. Without it, a large enough
 * boost would dominate the ordering on its own, and the engine would behave as though
 * the person had insisted on that thing — which is a different statement, and one they
 * did not make.
 */
export function maxCategoryScore(
  category: MatchCategory,
  increments: Readonly<Partial<Record<MatchCategory, number>>> = {},
): number {
  const base = CATEGORY_MAX_SCORE[category];

  if (base === 0) {
    return 0;
  }

  return Math.min(base + (increments[category] ?? 0), base * FEEDBACK_BOOST_CEILING);
}

/** The most availability can contribute per shared day, after a boost. */
export function maxAvailabilityPerDay(
  increments: Readonly<Partial<Record<MatchCategory, number>>> = {},
): number {
  return Math.min(
    AVAILABILITY_PER_DAY + (increments.AVAILABILITY ?? 0),
    AVAILABILITY_PER_DAY * FEEDBACK_BOOST_CEILING,
  );
}

/**
 * The largest total the preference field can possibly reach, whatever the feedback.
 *
 * Exists for one purpose: to keep `REQUIREMENT_BONUS` honest. The requirement must
 * outrank the whole preference field, and the only way to be sure of that after a
 * rematch is to compute the ceiling rather than eyeball the current totals. Availability
 * is handled separately because it has no base maximum to double — it is a per-day
 * figure under its own day cap, and the cap does not rise.
 */
export function maximumPreferenceTotal(
  increments: Readonly<Partial<Record<MatchCategory, number>>> = {},
): number {
  const categories = Object.keys(CATEGORY_MAX_SCORE).filter(
    (category) => CATEGORY_MAX_SCORE[category as MatchCategory] > 0,
  );

  const attributes = categories.reduce(
    (sum, category) => sum + maxCategoryScore(category as MatchCategory, increments),
    0,
  );

  return attributes + AVAILABILITY_DAY_CAP * maxAvailabilityPerDay(increments);
}

/**
 * The score for one category, as a proportion of what the client asked for.
 *
 * Integer floor division throughout, so the result is exact and identical on every
 * platform. A client who asked for nothing in a category scores nothing in it: there
 * is nothing to have matched.
 */
export function categoryScore(maximum: number, matched: number, asked: number): number {
  if (asked <= 0 || matched <= 0) {
    return 0;
  }

  return Math.floor((maximum * matched) / asked);
}

/** The strength an evidence item carries, for storage and for display ordering. */
export function strengthFor(isRequirement: boolean): PreferenceStrength {
  return isRequirement ? 'REQUIREMENT' : 'PREFERENCE';
}
