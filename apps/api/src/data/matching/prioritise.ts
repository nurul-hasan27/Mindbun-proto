import type { MatchCategory, MatchEvidenceInput } from './matchingTypes.js';
import { EXPLANATION_PRIORITY, MAX_SHOWN_EVIDENCE, MAX_SHOWN_PER_CATEGORY } from './weights.js';

/**
 * Choosing which few reasons to show.
 *
 * A candidate can match on seven attributes. Showing all seven is not an
 * explanation — it is a data dump that hands the ranking back to the person, which
 * is the one thing this product exists not to do. So the engine records everything
 * and the product shows a few.
 *
 * Three rules, in this order, and all three deterministic:
 *
 * 1. **Requirements before preferences.** A condition the client insisted on is
 *    the reason to believe the rest. It is also the only thing here that is not a
 *    matter of taste.
 * 2. **Then `EXPLANATION_PRIORITY`.** Documented in `weights.ts`: requirements,
 *    then the preferences strongest first, then availability, then session format.
 *    The two weakest signals sit last on purpose — a recommendation that opens with
 *    "they see clients online" is a recommendation about logistics.
 * 3. **Then at most `MAX_SHOWN_PER_CATEGORY`.** Without this, availability alone
 *    could fill a five-item list with five slightly different Tuesdays, and a
 *    recommendation would say "they are free when you are free" and nothing else.
 *
 * The final tie-break is the evidence key, so two items that tie on all three never
 * swap places between runs. This function is pure: the same evidence always yields
 * the same shortlist, in the same order, which is what makes the explanation a
 * function of the stored record and nothing else.
 */
export function prioritiseEvidence(
  evidence: readonly MatchEvidenceInput[],
  limit: number = MAX_SHOWN_EVIDENCE,
): readonly MatchEvidenceInput[] {
  const ranked = [...evidence].sort(
    (first, second) =>
      strengthRank(first) - strengthRank(second) ||
      EXPLANATION_PRIORITY[first.explanation] - EXPLANATION_PRIORITY[second.explanation] ||
      CATEGORY_ORDER.indexOf(first.category) - CATEGORY_ORDER.indexOf(second.category) ||
      first.clientKey.localeCompare(second.clientKey) ||
      first.therapistKey.localeCompare(second.therapistKey),
  );

  const shown: MatchEvidenceInput[] = [];
  const perCategory = new Map<MatchCategory, number>();

  for (const item of ranked) {
    if (shown.length >= limit) {
      break;
    }

    const used = perCategory.get(item.category) ?? 0;

    if (used >= MAX_SHOWN_PER_CATEGORY[item.category]) {
      continue;
    }

    perCategory.set(item.category, used + 1);
    shown.push(item);
  }

  return shown;
}

function strengthRank(evidence: MatchEvidenceInput): number {
  return evidence.strength === 'REQUIREMENT' ? 0 : 1;
}

/**
 * The engine's own category order, used only to break ties between explanations of
 * equal priority. Fixed here rather than derived from the evidence, so it does not
 * depend on the order the evidence happened to be built in. It is the scoring order,
 * read as a last resort when two reasons are otherwise indistinguishable.
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
