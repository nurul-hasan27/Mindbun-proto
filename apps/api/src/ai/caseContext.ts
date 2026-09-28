import type { AiCaseContext } from './aiProvider.js';
import type { CaseDetail } from '../data/matching/decisionTypes.js';
import { familyLabel } from '../data/matching/notOffered.js';
import type { MatchCategory } from '../data/matching/matchingTypes.js';

/**
 * Turning a case into the minimum a summariser is allowed to see.
 *
 * ## This function is the privacy boundary for Phase 9B
 *
 * `docs/human-matching.md` established that a client's own words sit behind a second,
 * explicit request — `readClientsWords` — so that reaching for them is a visible act rather
 * than a field that happened to be populated. `AiCaseContext` extends that: it has no field
 * for the intake note, a feedback note, a matcher's note, a biography, a client identifier
 * or a score, so a provider **cannot be shown** any of them when summarising a case. Not
 * "is not sent" — has nowhere to put it.
 *
 * The consequence worth stating plainly: the AI case summary is built from structured
 * matching data only. A matcher who wants the client's words still asks for them separately,
 * and an AI summary can never be a way around that.
 *
 * ## Two facts it does carry that are easy to overlook
 *
 * - **Requirements.** `hasRequirements` is the difference between "they mentioned work" and
 *   "they said this is essential", and a summary that does not carry it will read every
 *   preference as negotiable.
 * - **Prior feedback, as reason labels.** Structured keys resolved to names, never the
 *   client's own sentence. This is the one piece of history a summariser needs, and it is
 *   the labels rather than the words.
 *
 * ## What it never does
 *
 * It does not re-rank, re-score, re-order or re-select. The `alternatives` it carries are the
 * ones `findCase` already chose, in the engine's own order, capped by the same limit. A
 * summariser that preferred a different one would have to say so in prose, and `assertGroundedIn`
 * would have to find those words in what is here — which they are not.
 */

/**
 * The family labels a context carries.
 *
 * Not written out here. `familyLabel` is the workspace's own table — the same one behind
 * the "Work with" and "Style" lines a matcher already reads — so an AI summary and the case
 * it summarises cannot end up using two different words for the same family.
 */
export const NEED_CATEGORIES = {
  areasOfWork: familyLabel('AREA_OF_WORK'),
  communicationStyles: familyLabel('COMMUNICATION_STYLE'),
  approaches: familyLabel('THERAPEUTIC_APPROACH'),
  contextualExperiences: familyLabel('CONTEXTUAL_EXPERIENCE'),
  languages: familyLabel('LANGUAGE'),
  sessionFormats: familyLabel('SESSION_FORMAT'),
} as const satisfies Readonly<Record<string, string>>;

/** The `MatchCategory` behind each label, for a test that wants to assert the pairing. */
export const NEED_CATEGORY_CODES: Readonly<Record<string, MatchCategory>> = {
  areasOfWork: 'AREA_OF_WORK',
  communicationStyles: 'COMMUNICATION_STYLE',
  approaches: 'THERAPEUTIC_APPROACH',
  contextualExperiences: 'CONTEXTUAL_EXPERIENCE',
  languages: 'LANGUAGE',
  sessionFormats: 'SESSION_FORMAT',
} as const;

export interface BuildCaseContextOptions {
  /**
   * How many of the alternative candidates to describe.
   *
   * Three, and one fewer than the workspace itself shows. A summary is not the place to
   * read a shortlist; it is the place to notice that one of them covers something the
   * suggestion does not. Anything more would be duplicating the case detail a matcher is
   * already looking at.
   */
  readonly alternativeLimit?: number;
}

const DEFAULT_ALTERNATIVE_LIMIT = 3;

interface NamedNeed {
  readonly category: string;
  readonly label: string;
}

/**
 * The context a provider is given for a case.
 *
 * Takes a `CaseDetail` that must have been fetched **without** `revealWords`, which is the
 * default and so the only shape this needs to defend against: `clientsWords` is `null` and
 * this function does not read it either way.
 */
export function buildCaseContext(
  detail: CaseDetail,
  options: BuildCaseContextOptions = {},
): AiCaseContext {
  const limit = options.alternativeLimit ?? DEFAULT_ALTERNATIVE_LIMIT;

  const named = (
    values: readonly { readonly key: string; readonly name: string }[],
    category: string,
  ): readonly NamedNeed[] => values.map((value) => ({ category, label: value.name }));

  const needs: readonly NamedNeed[] = [
    ...named(detail.needs.areasOfWork, NEED_CATEGORIES.areasOfWork),
    ...named(detail.needs.communicationStyles, NEED_CATEGORIES.communicationStyles),
    ...named(detail.needs.approaches, NEED_CATEGORIES.approaches),
    ...named(detail.needs.contextualExperiences, NEED_CATEGORIES.contextualExperiences),
    ...named(detail.needs.languages, NEED_CATEGORIES.languages),
    ...named(detail.needs.sessionFormats, NEED_CATEGORIES.sessionFormats),
  ];

  // A structured reason key, resolved to its name. The client's own sentence about why they
  // passed on someone is *not* here and cannot be reached from here.
  const priorFeedback = detail.journey
    .flatMap((step) => step.clientFeedback)
    .map((key) => {
      const reason = detail.decisionReasons.find((entry) => entry.key === key);
      // A key with no name means the vocabulary changed. A bare key is better than a guess
      // at what it meant, and it is still a real stored value rather than something invented.
      return reason?.name ?? key;
    });

  return {
    needs,
    hasRequirements: detail.needs.markedAsRequirements,
    suggestion: {
      name: detail.suggestion.therapist.displayName,
      reasons: detail.suggestion.shared.map((entry) => entry.sentence),
      notOffered: detail.suggestion.notOffered,
    },
    // Only the eligible ones. A candidate the engine set aside is one no matcher may
    // choose, so naming it in a list of tradeoffs would be offering a decision that the
    // server will refuse — and the workspace page already states the set-aside position
    // in its own words.
    alternatives: detail.alternatives
      .filter((candidate) => candidate.eligible)
      .slice(0, limit)
      .map((candidate) => ({
        name: candidate.therapist.displayName,
        reasons: candidate.shared.map((entry) => entry.sentence),
        notOffered: candidate.notOffered,
      })),
    priorFeedback: [...new Set(priorFeedback)],
  };
}
