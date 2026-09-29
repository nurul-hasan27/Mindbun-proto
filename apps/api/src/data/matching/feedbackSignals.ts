import type { MatchCategory } from './matchingTypes.js';

/**
 * Turning "that did not work" into the next search.
 *
 * ## The one thing this file must never do
 *
 * **It must never turn a complaint into a requirement.**
 *
 * Someone who says "the communication style didn't feel right" has *not* said "I will
 * only see an exploratory therapist". They have not said what they want instead — they
 * have said what they did not get. Promoting the complaint to a hard requirement would
 * be inventing a condition they never stated, and it would then go on eliminating
 * candidates, silently, on their behalf. So a reason adjusts a *weight*. A weight makes
 * a preference count for more. It never turns a preference into a gate, and
 * `deriveRequirements` is not reachable from anything in this file.
 *
 * The distinction is worth stating plainly because it is the whole difference between
 * "we heard you" and "we decided for you":
 *
 * | Feedback says                          | This becomes                                       |
 * | -------------------------------------- | -------------------------------------------------- |
 * | "the communication style wasn't right" | communication style counts for more                |
 * | **not**                                | ~~only show me someone with a different style~~    |
 *
 * ## What this layer also does not do
 *
 * **It does not learn a new preference.** Nobody has told us what they wanted instead,
 * so there is nothing to learn. What we know is what they already asked for at intake
 * and one thing that did not fit, and the honest response to that is to weight the first
 * more heavily and remove the second — not to guess at an attribute nobody stated. If
 * the client said "exploratory" at intake, that preference is still there and now
 * counts for more; we do not infer a style they never named, and no therapist attribute
 * is invented to stand in for one.
 *
 * **It does not treat a report as a fact.** "I did not feel understood" is a statement
 * about someone's experience. It does not mean this therapist is ineffective, and this
 * layer does not encode that belief. See `feedbackTypes.ts` for why the data model
 * cannot express it either.
 *
 * **It does not change on the order reasons were picked in.** Someone ticking three
 * boxes and then a different three must produce the same next recommendation, or the
 * result would depend on the order a mouse happened to move. Every transformation here
 * sums into a fixed category order, and a test asserts that two orderings of the same
 * reasons are indistinguishable.
 *
 * ## The two reasons that do less than you would expect
 *
 * `felt-uncomfortable` ("I did not feel understood") and `other` ("Something else")
 * produce **no weight adjustment at all**, and that is the honest answer rather than a
 * missing one.
 *
 * - `other` is a box for something we did not think to ask about. There is no attribute
 *   to weight, by definition.
 * - `felt-uncomfortable` is about the interaction, not about a stated attribute of a
 *   person. Boosting "communication style" because someone did not feel understood would
 *   be a specific clinical claim this phase cannot support: not feeling understood is
 *   not evidence about a conversational style, and treating it as one would quietly turn
 *   a report into a diagnosis. Boosting availability because of it would be nonsense.
 *
 * Both still do something real: they are recorded, they remove the therapist from this
 * journey, and the person gets a different person next. What they do not do is claim an
 * adjustment that is not there.
 */

/**
 * Every reason key the product offers, and what each one adjusts.
 *
 * The key is the contract. The wording a person reads comes from the database's `name`
 * column and is expected to change; nothing in the engine may depend on it.
 */
export const FEEDBACK_ADJUSTMENTS: Readonly<
  Record<string, Partial<Record<MatchCategory, number>>>
> = {
  'communication-mismatch': { COMMUNICATION_STYLE: 40 },
  'different-experience': { CONTEXTUAL_EXPERIENCE: 50 },
  'not-the-right-approach': { THERAPEUTIC_APPROACH: 30 },
  'language-mismatch': { LANGUAGE: 40 },
  'availability-mismatch': { AVAILABILITY: 30 },
  'format-mismatch': { SESSION_FORMAT: 40 },
  // Deliberately empty. See the file comment.
  'felt-uncomfortable': {},
  other: {},
};

/** Every key the engine recognises, including the two that adjust nothing. */
export const FEEDBACK_REASON_KEYS: readonly string[] = Object.keys(FEEDBACK_ADJUSTMENTS);

/**
 * The fixed order categories are resolved in.
 *
 * Exists so the outcome cannot depend on which box was ticked first. The order is the
 * engine's own category order, and it is the same one used to break ties elsewhere.
 */
const CATEGORY_ORDER: readonly MatchCategory[] = [
  'AREA_OF_WORK',
  'CONTEXTUAL_EXPERIENCE',
  'COMMUNICATION_STYLE',
  'THERAPEUTIC_APPROACH',
  'LANGUAGE',
  'SESSION_FORMAT',
  'AVAILABILITY',
];

/** What the next pass does differently, and why. */
export interface FeedbackSignals {
  /** The keys that were given, sorted, so the record is stable. */
  readonly reasonKeys: readonly string[];
  /**
   * How much more each category counts, added to its base maximum.
   *
   * Duplicated reasons are counted once: ticking "the timing didn't work" twice is not
   * twice the complaint, and letting it be would be a way to buy priority.
   */
  readonly increments: Readonly<Partial<Record<MatchCategory, number>>>;
  /**
   * The categories the feedback spoke about, whether or not it adjusted them.
   *
   * Used to decide what a "what changed" section is allowed to claim: it can only talk
   * about the things someone actually mentioned, and only where a real difference
   * exists.
   */
  readonly touchedCategories: readonly MatchCategory[];
}

/** The signals for "nothing has been said yet", which is a first match, not a rematch. */
export const NO_FEEDBACK_SIGNALS: FeedbackSignals = {
  reasonKeys: [],
  increments: {},
  touchedCategories: [],
};

/**
 * Feedback into matching signals. Pure, total, and order-independent.
 *
 * An unrecognised key contributes nothing. It cannot happen through the API — the route
 * rejects unknown reasons with a `400` before this is called — and a defensive fall
 * through means a term added to the vocabulary without a rule here degrades to "recorded,
 * no adjustment" rather than crashing a search. It is a gap to be noticed in review, not
 * a reason to make a search fail.
 */
export function toFeedbackSignals(reasonKeys: readonly string[]): FeedbackSignals {
  const unique = [...new Set(reasonKeys)].sort();

  const increments: Partial<Record<MatchCategory, number>> = {};
  const touched = new Set<MatchCategory>();

  for (const key of unique) {
    const adjustment = FEEDBACK_ADJUSTMENTS[key];

    if (adjustment === undefined) {
      continue;
    }

    for (const [category, amount] of Object.entries(adjustment) as [MatchCategory, number][]) {
      if (amount > 0) {
        increments[category] = (increments[category] ?? 0) + amount;
      }
    }

    for (const category of Object.keys(adjustment) as MatchCategory[]) {
      touched.add(category);
    }
  }

  // `felt-uncomfortable` and `other` adjust nothing but still belong to a category the
  // person meant, so they are recorded as touched by the category they are *about*,
  // which for them is none — a section that said "your feedback was about the timing"
  // after only "I did not feel understood" would be inventing a connection.
  return {
    reasonKeys: unique,
    increments,
    touchedCategories: CATEGORY_ORDER.filter((category) => touched.has(category)),
  };
}
