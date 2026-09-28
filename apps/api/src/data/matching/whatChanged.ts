import type { MatchCategory } from './matchingTypes.js';
import type { ChangeNote, ComparisonAttributes, ComparisonSide } from './feedbackTypes.js';
import type { FeedbackSignals } from './feedbackSignals.js';
import type { ExplanationVocabulary } from './explanations.js';

/**
 * "What changed this time."
 *
 * The hardest page in the product to write honestly, because the tempting version of it
 * is a lie factory. A section that says "more exploratory, better availability,
 * closer to what you asked for" is easy to generate and almost impossible to justify:
 * every one of those claims is a comparison, and a comparison is a claim about what
 * changed, which means it has to be checkable.
 *
 * So this module can only say a change happened when all three of these hold:
 *
 * 1. **The person mentioned it.** The category has to be one the feedback spoke about.
 *    Silently improving something they did not raise would imply we took something into
 *    account that we did not.
 * 2. **Something is actually different.** The two therapists' attributes for that
 *    category are not the same set. A category that is identical on both sides is not a
 *    change, however much the internal ordering moved.
 * 3. **The new one covers the client's stated preference better.** Measured with the
 *    same share the engine scores with — matched keys over keys the client actually
 *    chose — and only claimed when the new side's share is strictly greater. This is
 *    what lets the page say "a more exploratory style" *only* when the client asked for
 *    exploratory and the new therapist has it and the old one did not.
 *
 * Failing any of those, the category is left out. A short list of true differences beats
 * a full list of plausible ones, and if nothing changed the section says so rather than
 * filling itself.
 *
 * ## The claim about availability is deliberately weaker
 *
 * "They also overlap with your preferred evening sessions" is only ever said when the
 * new match has availability evidence and the previous one did not. When both overlap,
 * there is no change to report — the previous page already said so, and repeating it here
 * would be padding dressed as news.
 *
 * ## What this never contains
 *
 * No weight, no score, no rank, and no count of candidates. Every sentence is a fact about
 * one therapist's stated attributes, or about the overlap that the engine found as
 * evidence, and both are on the page above it.
 */

/**
 * Deterministic presentation order, and the order the brief lists them in.
 *
 * Engine category names, not a separate display vocabulary. A second namespace would
 * need a mapping table, and the mapping is the thing that drifts: a key added to the
 * engine and forgotten here would simply never appear in this section, quietly. The
 * *label* below is where display text belongs.
 */
const CATEGORY_ORDER: readonly MatchCategory[] = [
  'COMMUNICATION_STYLE',
  'CONTEXTUAL_EXPERIENCE',
  'THERAPEUTIC_APPROACH',
  'LANGUAGE',
  'AVAILABILITY',
  'SESSION_FORMAT',
];

/** Enough reasons to be useful. More than this stops being a summary. */
const MAX_NOTES = 3;

/** The label shown beside each sentence. Display text lives here and nowhere else. */
const LABELS: Readonly<Record<MatchCategory, string>> = {
  // Not in the presentation order above, because no feedback reason adjusts it and
  // nothing can ever say "this changed" about it. Present for completeness so the type
  // is total and a future reason has somewhere to go.
  AREA_OF_WORK: 'What they work with',
  COMMUNICATION_STYLE: 'Communication style',
  CONTEXTUAL_EXPERIENCE: 'Experience',
  THERAPEUTIC_APPROACH: 'Approach',
  LANGUAGE: 'Language',
  AVAILABILITY: 'Availability',
  SESSION_FORMAT: 'Sessions',
};

export function describeChange(
  previous: ComparisonSide,
  current: ComparisonSide,
  feedback: FeedbackSignals,
  vocabulary: ExplanationVocabulary,
  /**
   * What the client said they wanted, per category, from their intake.
   *
   * Passed in rather than recovered from either side's evidence, because a preference
   * only appears in the evidence when the therapist happened to share it — and the case
   * worth describing is precisely the one where they did not. Someone who asked for an
   * exploratory therapist and was given a direct one leaves no style evidence behind,
   * and a module that read the preference from there would conclude they had asked for
   * nothing and stay silent about the next person who actually offers exploratory.
   */
  stated: Readonly<Record<MatchCategory, readonly string[]>>,
): readonly ChangeNote[] {
  const notes: ChangeNote[] = [];

  for (const category of CATEGORY_ORDER) {
    if (notes.length >= MAX_NOTES) {
      break;
    }

    // Rule 1: the person has to have mentioned it.
    if (!feedback.touchedCategories.includes(category)) {
      continue;
    }

    const note =
      category === 'AVAILABILITY'
        ? availabilityNote(previous, current)
        : attributeNote(category, previous, current, vocabulary, stated[category]);

    if (note !== null) {
      notes.push(note);
    }
  }

  return notes;
}

/** The client's share of a category, in the same proportion the engine scores with. */
function share(preferred: readonly string[], offered: readonly string[]): number {
  if (preferred.length === 0) {
    return 0;
  }

  return preferred.filter((key) => offered.includes(key)).length / preferred.length;
}

/** The attributes of one category, for one side. */
function attributesFor(category: MatchCategory, side: ComparisonSide): readonly string[] {
  const attributes: ComparisonAttributes = side.attributes;

  switch (category) {
    case 'COMMUNICATION_STYLE':
      return attributes.communicationStyles;
    case 'CONTEXTUAL_EXPERIENCE':
      return attributes.contextualExperience;
    case 'THERAPEUTIC_APPROACH':
      return attributes.approaches;
    case 'LANGUAGE':
      return attributes.languages;
    case 'SESSION_FORMAT':
      return attributes.sessionFormats;
    case 'AREA_OF_WORK':
      return attributes.areasOfWork;
    case 'AVAILABILITY':
      return [];
  }
}

function attributeNote(
  category: MatchCategory,
  previous: ComparisonSide,
  current: ComparisonSide,
  vocabulary: ExplanationVocabulary,
  preferred: readonly string[],
): ChangeNote | null {
  const before = attributesFor(category, previous);
  const after = attributesFor(category, current);
  const label = LABELS[category];

  // Rule 2: identical attributes are not a change, whatever the ordering did.
  if (sameSet(before, after)) {
    return null;
  }

  const beforeShare = share(preferred, before);
  const afterShare = share(preferred, after);

  // Rule 3: only claim an improvement the evidence actually shows. The new side has to
  // cover something the client asked for that the old one did not, *and* cover a
  // strictly greater share of what they asked for. Either test alone would be
  // overclaiming: a candidate can gain one attribute while losing another they named.
  const newlyCovers = preferred.filter((key) => after.includes(key) && !before.includes(key));

  if (newlyCovers.length > 0 && afterShare > beforeShare) {
    const names = newlyCovers
      .map((key) => phraseFor(key, vocabulary))
      .join(newlyCovers.length > 1 ? ' and ' : '');

    return {
      category,
      detail: label,
      sentence:
        category === 'COMMUNICATION_STYLE'
          ? `You told us the way they talked was not right, and this therapist works more in the ${names} style you were after.`
          : `You said something different would help, and this therapist has ${names} — which the last one did not.`,
    };
  }

  // Different, but not demonstrably closer to anything stated. Say the smaller truth, and
  // say it about the *difference* rather than about the whole attribute set. Naming
  // attributes both people have would be padding: the reader is being told something
  // changed, and most of what follows would not have.
  const newlyHas = after.filter((key) => !before.includes(key));

  if (newlyHas.length === 0) {
    // The sets differ only by what the last one had. Saying so is more useful than
    // listing what is left, and it cannot be mistaken for an improvement.
    return {
      category,
      detail: label,
      sentence: 'This therapist works differently here, though not in a way you asked about.',
    };
  }

  return {
    category,
    detail: label,
    sentence: `This is different here: ${newlyHas.map((key) => phraseFor(key, vocabulary)).join(', ')}.`,
  };
}

function availabilityNote(previous: ComparisonSide, current: ComparisonSide): ChangeNote | null {
  const had = previous.evidence.some((item) => item.category === 'AVAILABILITY');
  const has = current.evidence.some((item) => item.category === 'AVAILABILITY');

  // Rule 3, applied to the weakest available claim: a newly shared time is a change. An
  // overlap that was already there is not news, so it is not repeated.
  if (has && !had) {
    const slot = current.evidence.find((item) => item.category === 'AVAILABILITY')?.overlap;

    if (slot === undefined) {
      return {
        category: 'AVAILABILITY',
        detail: LABELS.AVAILABILITY,
        sentence: 'This one also has a time that works for both of you.',
      };
    }

    return {
      category: 'AVAILABILITY',
      detail: `${dayWord(slot.dayOfWeek)} ${formatMinute(slot.startMinute)}–${formatMinute(slot.endMinute)}`,
      sentence: `The last one had no workable time with you. This therapist does — ${dayWord(slot.dayOfWeek)}, ${formatMinute(slot.startMinute)} to ${formatMinute(slot.endMinute)} your time.`,
    };
  }

  return null;
}

/** Set equality, order-insensitive. Two lists of the same keys are the same thing. */
function sameSet(first: readonly string[], second: readonly string[]): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const left = new Set(first);
  return second.every((key) => left.has(key));
}

const DAY_WORDS: Readonly<Record<string, string>> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

function dayWord(dayOfWeek: string): string {
  return DAY_WORDS[dayOfWeek] ?? dayOfWeek;
}

function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** A vocabulary key in the product's words, never the database's internal name. */
function phraseFor(key: string, vocabulary: ExplanationVocabulary): string {
  return vocabulary.names.get(key) ?? key.replaceAll('-', ' ');
}
