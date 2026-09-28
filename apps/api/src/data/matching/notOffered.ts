import type { MatchCategory, MatchEvidenceInput } from './matchingTypes.js';
import { displayName, type ExplanationVocabulary } from './explanations.js';
import type { StoredIntake } from './signals.js';

/**
 * What a candidate does **not** carry, for the families the client asked about.
 *
 * ## Why this is worth building
 *
 * The engine's evidence is positive-only: it records what a candidate shares with the
 * client and says nothing about what they lack. That is the right design for a page shown
 * to a client — a list of things someone does not offer is a list of reasons to talk
 * yourself out of them, and it belongs nowhere near a person choosing care.
 *
 * A reviewer is doing the opposite job. Their question is "why might this other person be
 * a better fit", and the honest answer needs both halves: what they share, and what they do
 * not. Without the second half a reviewer is comparing lists of overlaps and has to hold
 * the client's stated preferences in their head to notice an absence — which is exactly
 * the arithmetic the engine was built to do for them.
 *
 * So this is a plain set difference over stored keys. It is not a score, not a penalty, and
 * not an inference: every name in the output is a term the client selected, checked against
 * a term a therapist declared.
 *
 * ## The rule that makes it correct rather than merely plausible
 *
 * Families are not all the same shape, and treating them the same would produce confident
 * nonsense.
 *
 * **All-of families** — areas of work, communication style, contextual experience,
 * approach. The client named specific things and this candidate has some of them. Naming
 * the missing ones is exactly right.
 *
 * **Any-of families** — language and session format. The client said _any one of these_
 * would do, and the engine's requirement is satisfied if they share even one. So a
 * candidate who speaks one of three named languages is **not** missing the other two:
 * they met the condition, and listing their absences would tell a reviewer they had failed
 * something they passed. For these families the only true statement is a single one — none
 * of the languages you named — and it appears only when the candidate shares none of them.
 *
 * That candidate is `INELIGIBLE`, so in practice an any-of family never appears here. The
 * rule is implemented anyway, because a workspace that only behaves correctly while its
 * input happens to be filtered correctly is not correct, it is lucky.
 */

/** Families where the client named things and sharing most of them is the point. */
const ALL_OF_FAMILIES = [
  'AREA_OF_WORK',
  'COMMUNICATION_STYLE',
  'CONTEXTUAL_EXPERIENCE',
  'THERAPEUTIC_APPROACH',
] as const satisfies readonly MatchCategory[];

/** Families where any one of the named terms is enough. */
const ANY_OF_FAMILIES = ['LANGUAGE', 'SESSION_FORMAT'] as const satisfies readonly MatchCategory[];

/** What a candidate is missing, per family, in a form the workspace can show. */
export interface NotOffered {
  readonly category: string;
  readonly names: readonly string[];
}

const FAMILY_LABEL: Readonly<Record<MatchCategory, string>> = {
  AREA_OF_WORK: 'Work with',
  CONTEXTUAL_EXPERIENCE: 'Experience',
  COMMUNICATION_STYLE: 'Style',
  THERAPEUTIC_APPROACH: 'Approach',
  LANGUAGE: 'Language',
  SESSION_FORMAT: 'Sessions',
  AVAILABILITY: 'Times',
};

/** The label a matcher reads beside a family. */
export function familyLabel(category: MatchCategory): string {
  return FAMILY_LABEL[category];
}

/** What the client asked for, per family, as stored keys. */
function askedFor(intake: StoredIntake, category: MatchCategory): readonly string[] {
  switch (category) {
    case 'AREA_OF_WORK':
      return intake.areasOfWork;
    case 'CONTEXTUAL_EXPERIENCE':
      return intake.contextualExperiences;
    case 'COMMUNICATION_STYLE':
      // Suppressed when the client said they are not sure yet: nobody asked for a
      // particular style, so none can be missing from anyone.
      return intake.openToGuidance ? [] : intake.communicationStyles;
    case 'THERAPEUTIC_APPROACH':
      return intake.approaches;
    case 'LANGUAGE':
      return intake.languages;
    case 'SESSION_FORMAT':
      return intake.sessionFormats;
    case 'AVAILABILITY':
      // A set of times rather than a list of terms, compared as an overlap and shown in
      // the profile section. It has no "missing terms" to report.
      return [];
  }
}

/** Every term the client named that appears anywhere in the candidate's evidence. */
function offeredKeys(evidence: readonly MatchEvidenceInput[], category: MatchCategory): string[] {
  return evidence.filter((item) => item.category === category).map((item) => item.therapistKey);
}

/**
 * What this candidate does not carry, for the families the client asked about.
 *
 * Only families the client actually named appear, so a client who asked nothing about
 * approaches is never shown a line about approaches.
 */
export function notOffered(
  intake: StoredIntake,
  evidence: readonly MatchEvidenceInput[],
  vocabulary: ExplanationVocabulary,
): readonly NotOffered[] {
  const out: NotOffered[] = [];

  for (const category of ALL_OF_FAMILIES) {
    const asked = askedFor(intake, category);

    if (asked.length === 0) {
      continue;
    }

    const offered = offeredKeys(evidence, category);
    const missing = asked.filter((key) => !offered.includes(key));

    // Only the empty case is skipped. A family the candidate covers entirely is not a
    // family they are missing anything from, and saying so would be padding on the section
    // a reviewer trusts most.
    //
    // The case where they have *none* of what was named is deliberately **not** skipped
    // here, even though the names look the same. It looks the same for a one-item family —
    // and a one-item family is the common one: a client who asked for an exploratory
    // conversation, and a therapist who does not work that way. Suppressing that line
    // because the whole family is missing left the most useful sentence on the page
    // unsaid, and it was the sentence that would have told a matcher the engine's own
    // suggestion does not match the one thing the client said they wanted.
    if (missing.length === 0) {
      continue;
    }

    out.push({
      category,
      // The term itself, not a phrase: this is a list of what is absent, and a list of
      // clauses would read as instructions to the reviewer.
      names: missing.map((key) => displayName(key, vocabulary)),
    });
  }

  for (const category of ANY_OF_FAMILIES) {
    const asked = askedFor(intake, category);

    if (asked.length === 0) {
      continue;
    }

    // The only absence worth reporting: they offer none of what was named. A candidate
    // who offers one of three languages met the condition, and listing the other two would
    // tell a reviewer they had failed something they passed.
    if (offeredKeys(evidence, category).length > 0) {
      continue;
    }

    out.push({
      category,
      names: asked.map((key) => displayName(key, vocabulary)),
    });
  }

  return out;
}
