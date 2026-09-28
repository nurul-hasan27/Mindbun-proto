import type { DayName } from '../dayOfWeek.js';
import type { MatchEvidenceInput, MatchExplanation } from './matchingTypes.js';

/**
 * Stage 7b, and the part a client actually reads.
 *
 * ## The one rule
 *
 * **A sentence is a function of its evidence row and nothing else.** No lookup, no
 * inference, no generation, no model. Given the rows, the sentences are determined.
 * That is what makes "every sentence maps to evidence" checkable rather than
 * aspirational: a sentence cannot mention a fact that is not in the row it came
 * from, because there is nowhere else for it to come from.
 *
 * It also means stored matches always read in the *current* wording. Nothing is
 * persisted as prose, so a match from last year explains itself with today's words
 * and cannot contradict them.
 *
 * ## Where the words come from
 *
 * Two places, in this order:
 *
 * 1. `MATCH_PHRASES` — hand-written wording for the terms the intake offers. These
 *    are deliberately *not* the question labels. A question asks "Work or career";
 *    an explanation says "work and career", because a sentence and an option are
 *    different jobs and reading a question aloud mid-sentence would be worse.
 * 2. The vocabulary's own name, for any key with no phrase here. A term added to
 *    the database next month produces a readable, if plainer, explanation rather
 *    than a blank — and the key itself is never shown to anyone.
 *
 * ## What a sentence must not do
 *
 * - No ranking, no score, no "best". There is no sentence in this file that
 *   compares two therapists, because a comparison requires the other one to be
 *   named, and naming the other one is exactly the marketplace this product is
 *   arguing against.
 * - No clinical claim. Nothing here says a therapist will help, or that an
 *   approach works, or that anything is better than anything else.
 * - No inference. "Their experience includes the Indian diaspora" is only ever
 *   written for a therapist who *stated* that context about themselves. A name and
 *   a postcode produce nothing.
 */

/** One rendered reason, ready to be returned and read. */
export interface Explanation {
  /** The machine key the sentence came from. Lets a client or a test trace it. */
  readonly key: MatchExplanation;
  /** The full sentence. Never contains a number or a comparison. */
  readonly sentence: string;
  /** A short noun phrase, for a compact label beside a fuller sentence. */
  readonly detail: string;
}

/**
 * Hand-written wording, keyed by category and then by vocabulary key.
 *
 * Scoped by category on purpose. The key `exploratory` is both a conversation style
 * and a therapeutic approach, and the two need opposite treatment: as a style it
 * wants to read as "someone who helps you explore things", while as an approach it
 * must stay the plain word "Exploratory", because a sentence claiming someone *is*
 * "someone who helps you explore things" as a method of therapy is a clinical claim
 * this phase has no basis for. A single flat map cannot hold both, and picking one
 * would have quietly made one of them wrong.
 *
 * These phrases win over the database's own name, and that ordering is the point: the
 * database holds an internal taxonomy — "Career transitions", "Burnout" — while an
 * explanation is a sentence in the product's voice, where the same term is "work and
 * career" and "feeling overwhelmed". Internal taxonomy is not shown to clients.
 *
 * A key with no phrase here falls back to the database's name, so a term added to the
 * vocabulary next month produces a readable if plainer sentence rather than a blank.
 */
export const MATCH_PHRASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  AREA_OF_WORK: {
    relationships: 'relationships',
    'career-transitions': 'work and career',
    'family-dynamics': 'family',
    'life-transitions': 'big life changes',
    burnout: 'feeling overwhelmed',
    'work-stress': 'stress at work',
  },
  // Descriptions of a person, never of a method.
  COMMUNICATION_STYLE: {
    exploratory: 'someone who helps you explore things',
    structured: 'someone who gives you structure',
    warm: 'someone warm and unhurried',
    direct: 'someone direct',
    reflective: 'someone who reflects things back',
    gentle: 'someone who moves at your pace',
  },
  // Deliberately empty. A therapeutic approach is named, not characterised, and the
  // database's name is already a description rather than a judgement.
  THERAPEUTIC_APPROACH: {},
  // Always a stated experience, never a reading of a name.
  CONTEXTUAL_EXPERIENCE: {
    'indian-diaspora': 'the Indian diaspora',
    'cross-cultural-relationships': 'life between cultures',
    relocation: 'relocation',
    'international-students': 'international students',
    'third-culture-upbringing': 'growing up between cultures',
    'working-across-cultures': 'working across cultures',
    'family-expectations': 'family expectations',
  },
  SESSION_FORMAT: {
    online: 'online',
    'in-person': 'in person',
  },
  // Language names are already the right words for a sentence.
  LANGUAGE: {},
  // Availability has no vocabulary key; its wording comes from the slot itself.
  AVAILABILITY: {},
};

/** Days as a person would say them, not as an enum reads. */
const DAY_NAMES: Readonly<Record<DayName, string>> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

/** `1290` → `"21:30"`. Minutes past midnight, because that is what is stored. */
export function formatMinuteOfDay(minute: number): string {
  const clamped = Math.max(0, Math.round(minute));
  const hours = Math.floor(clamped / 60) % 24;
  const minutes = clamped % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** "19:00–21:00", or "from 19:00" when a slot runs past local midnight. */
function formatWindow(startMinute: number, endMinute: number): string {
  if (endMinute >= 1440) {
    return `from ${formatMinuteOfDay(startMinute)}`;
  }

  return `${formatMinuteOfDay(startMinute)}–${formatMinuteOfDay(endMinute)}`;
}

/**
 * The words for one vocabulary key, in one category.
 *
 * Phrase, then the database's own name, then the key with its hyphens turned into
 * spaces — so a term added to the vocabulary before anyone has written a phrase for
 * it degrades to a slightly plain sentence rather than to nothing at all. Nobody
 * should ever see a raw key; the last resort exists so that a bad row cannot produce
 * an empty sentence.
 *
 * Exported because the reviewer workspace needs the same words for the same keys. A
 * second naming function would be a second way for a vocabulary key to reach a person as
 * something other than its own name.
 *
 * Not lower-cased. A name from the database is a proper noun — "Hindi", "Exploratory"
 * — and turning it into "hindi" would be a small typo in front of a person at the
 * exact moment the product is asking them to trust it. The hand-written phrases are
 * written to run on mid-sentence, so they do not need the help.
 */
export function nameFor(
  category: MatchEvidenceInput['category'],
  key: string,
  vocabulary: ExplanationVocabulary,
): string {
  return MATCH_PHRASES[category]?.[key] ?? vocabulary.names.get(key) ?? key.replaceAll('-', ' ');
}

/**
 * A stored key as a proper noun, for a place that is naming it rather than using it.
 *
 * `nameFor` is the other half of this and the two are easy to confuse. A sentence needs a
 * phrase that runs mid-clause — "someone who helps you explore things" — while a list of
 * what a client asked for needs the term itself: "Exploratory", "Career transitions". Using
 * the phrase version in a list produces rows that read as instructions, and using the noun
 * in a sentence produces text that is technically true and unreadable.
 *
 * Falls back the same way, and for the same reason: the database's own name, then the key
 * with hyphens turned into spaces, so a term added to the vocabulary before anyone wrote a
 * phrase for it still appears as something a person can read.
 */
export function displayName(key: string, vocabulary: ExplanationVocabulary): string {
  return vocabulary.names.get(key) ?? key.replaceAll('-', ' ');
}

export interface ExplanationVocabulary {
  /** Vocabulary key → the name the database holds, e.g. `"hi"` → `"Hindi"`. */
  readonly names: ReadonlyMap<string, string>;
}

/**
 * Render one evidence row.
 *
 * Total over `MATCH_EXPLANATIONS`: every possible reason has a case here, so an
 * unhandled value is a type error rather than a blank on someone's screen.
 */
export function explainEvidence(
  evidence: MatchEvidenceInput,
  vocabulary: ExplanationVocabulary,
): Explanation {
  switch (evidence.explanation) {
    case 'REQUIRED_LANGUAGE':
      return {
        key: evidence.explanation,
        sentence: `They speak ${nameFor('LANGUAGE', evidence.therapistKey, vocabulary)}, one of the languages you chose.`,
        detail: nameFor('LANGUAGE', evidence.therapistKey, vocabulary),
      };

    case 'PREFERRED_LANGUAGE':
      return {
        key: evidence.explanation,
        sentence: `They also speak ${nameFor('LANGUAGE', evidence.therapistKey, vocabulary)}.`,
        detail: nameFor('LANGUAGE', evidence.therapistKey, vocabulary),
      };

    case 'AREA_OF_WORK':
      return {
        key: evidence.explanation,
        sentence: `You said you wanted support with ${nameFor('AREA_OF_WORK', evidence.clientKey, vocabulary)}, and they work with it.`,
        detail: nameFor('AREA_OF_WORK', evidence.clientKey, vocabulary),
      };

    case 'COMMUNICATION_STYLE':
      return {
        key: evidence.explanation,
        sentence: `You wanted ${nameFor('COMMUNICATION_STYLE', evidence.clientKey, vocabulary)}.`,
        detail: nameFor('COMMUNICATION_STYLE', evidence.clientKey, vocabulary),
      };

    case 'THERAPEUTIC_APPROACH':
      // Deliberately descriptive. A sentence that said one approach was better
      // would be making a clinical claim this phase has no basis for.
      return {
        key: evidence.explanation,
        sentence: `Their way of working is ${nameFor('THERAPEUTIC_APPROACH', evidence.therapistKey, vocabulary)}.`,
        detail: nameFor('THERAPEUTIC_APPROACH', evidence.therapistKey, vocabulary),
      };

    case 'CONTEXTUAL_EXPERIENCE':
      return {
        key: evidence.explanation,
        sentence: `They have direct experience with ${nameFor('CONTEXTUAL_EXPERIENCE', evidence.clientKey, vocabulary)}.`,
        detail: nameFor('CONTEXTUAL_EXPERIENCE', evidence.clientKey, vocabulary),
      };

    case 'SESSION_FORMAT':
      return {
        key: evidence.explanation,
        sentence: `They see clients ${nameFor('SESSION_FORMAT', evidence.therapistKey, vocabulary)}.`,
        detail: nameFor('SESSION_FORMAT', evidence.therapistKey, vocabulary),
      };

    case 'AVAILABILITY_OVERLAP':
      return explainAvailability(evidence);
  }
}

function explainAvailability(evidence: MatchEvidenceInput): Explanation {
  const overlap = evidence.overlap;

  if (overlap === undefined) {
    // Unreachable for real evidence, and the type allows it so a stored row from a
    // future version cannot crash a page. Better a plain sentence than a blank.
    return {
      key: evidence.explanation,
      sentence: 'Some of your available times overlap with theirs.',
      detail: 'Overlapping times',
    };
  }

  const day = DAY_NAMES[overlap.dayOfWeek];
  const window = formatWindow(overlap.startMinute, overlap.endMinute);
  const seasonal = overlap.weeks.length < 2;
  const detail = `${day} ${window}`;

  return {
    key: evidence.explanation,
    sentence: seasonal
      ? `You are both free on ${day} ${window} your time, for part of the year.`
      : `You are both free on ${day} ${window} your time.`,
    detail,
  };
}

/** Render a prioritised shortlist, in the order it was chosen. */
export function explainAll(
  evidence: readonly MatchEvidenceInput[],
  vocabulary: ExplanationVocabulary,
): readonly Explanation[] {
  return evidence.map((item) => explainEvidence(item, vocabulary));
}
