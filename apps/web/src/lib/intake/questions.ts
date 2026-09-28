import type { IntakeVocabulary, LanguageView } from '../api/types';
import type { IntakeDraft } from './draft';

/**
 * The questions, and the vocabulary each one speaks in.
 *
 * The phrasing here is the product's, not the database's. "Someone who helps me
 * explore things" is what a person reads; `exploratory` is what gets stored, and
 * why a change to this copy never invalidates anyone's answers. The mapping is
 * the whole point of this file, and `docs/intake-flow.md` sets it out in full.
 *
 * Where we have no better words than the vocabulary's own — a language, an area
 * of work — the label comes from the service, so nothing here is a hardcoded
 * copy that drifts from the database.
 */

export interface Choice {
  /** Vocabulary key, or absent for an answer that maps to no term. */
  readonly key?: string;
  /** Language code, when the choice is a language. */
  readonly code?: string;
  /** What a person reads. */
  readonly label: string;
  /** One line under the choice, when it needs saying. */
  readonly note?: string;
}

export type QuestionKind = 'multi' | 'single' | 'text';

export type QuestionId =
  | 'support'
  | 'conversation'
  | 'context'
  | 'language'
  | 'sessions'
  | 'availability'
  | 'anything-else';

export interface Question {
  readonly id: QuestionId;
  /** The question itself, as the page's only heading. */
  readonly title: string;
  /** A second sentence: why we are asking, or what to expect. */
  readonly explanation?: string;
  readonly kind: QuestionKind;
  readonly required: boolean;
  /** `true` when a person may continue without answering. */
  readonly skippable: boolean;
}

export const questions: readonly Question[] = [
  {
    id: 'support',
    title: 'What would you like support with right now?',
    explanation:
      'Choose as many as apply. This is about your life right now, not a description of you.',
    kind: 'multi',
    required: true,
    skippable: false,
  },
  {
    id: 'conversation',
    title: 'What kind of conversation feels most helpful?',
    explanation:
      'There is no right answer here. If none of these sound right, telling us that is more useful than guessing.',
    kind: 'multi',
    required: true,
    skippable: false,
  },
  {
    id: 'context',
    title: 'What matters to you when choosing a therapist?',
    explanation:
      'Optional. Some people have a clear sense of the experience they would want their therapist to recognise.',
    kind: 'multi',
    required: false,
    skippable: true,
  },
  {
    id: 'language',
    title: 'What language would you feel most comfortable speaking?',
    explanation: 'Choose as many as you like. A session can be in more than one language.',
    kind: 'multi',
    required: true,
    skippable: false,
  },
  {
    id: 'sessions',
    title: 'How would you prefer to have your sessions?',
    explanation: 'Either answer is fine, and “either” is a real answer.',
    kind: 'single',
    required: true,
    skippable: false,
  },
  {
    id: 'availability',
    title: 'When would sessions usually work for you?',
    explanation:
      'Optional, and a rough sense of your week is enough. A later phase will use this to suggest times that overlap.',
    kind: 'multi',
    required: false,
    skippable: true,
  },
  {
    id: 'anything-else',
    title: 'Is there anything else you’d like us to know?',
    explanation:
      'You can keep this brief. Share only what feels comfortable — whatever you write is held unanalysed, and this prototype sends it nowhere else.',
    kind: 'text',
    required: false,
    skippable: true,
  },
] as const;

export function questionById(id: QuestionId): Question {
  const found = questions.find((question) => question.id === id);

  if (found === undefined) {
    throw new Error(`Unknown intake question: ${id}`);
  }

  return found;
}

export const questionOrder: readonly QuestionId[] = questions.map((question) => question.id);

export function questionIndex(id: QuestionId): number {
  return questionOrder.indexOf(id);
}

export function nextQuestion(id: QuestionId): QuestionId | null {
  return questionOrder[questionIndex(id) + 1] ?? null;
}

export function previousQuestion(id: QuestionId): QuestionId | null {
  return questionOrder[questionIndex(id) - 1] ?? null;
}

// ---------------------------------------------------------------------------
// The wording
// ---------------------------------------------------------------------------

const SUPPORT_CHOICES: readonly Choice[] = [
  { key: 'relationships', label: 'Relationships' },
  { key: 'career-transitions', label: 'Work or career' },
  { key: 'family-dynamics', label: 'Family' },
  { key: 'life-transitions', label: 'Life changes' },
  { key: 'burnout', label: 'Feeling overwhelmed' },
  {
    label: 'Something else',
    note: 'The last question is where you can say it in your own words.',
  },
];

const CONVERSATION_CHOICES: readonly Choice[] = [
  { key: 'exploratory', label: 'Someone who helps me explore things' },
  { key: 'structured', label: 'Someone who gives me structure' },
  { key: 'reflective', label: 'Someone who asks thoughtful questions' },
  { key: 'solution-focused', label: 'Someone who helps me work toward practical steps' },
  {
    label: 'I’m not sure yet',
    note: 'A genuinely useful answer. We would rather know than guess.',
  },
];

const CONTEXT_CHOICES: readonly Choice[] = [
  { key: 'indian-diaspora', label: 'Someone familiar with Indian family dynamics' },
  { key: 'cross-cultural-relationships', label: 'Someone who understands life between cultures' },
  { key: 'relocation', label: 'Someone experienced with relocation' },
  { key: 'international-students', label: 'Someone who has worked with international students' },
  { key: 'third-culture-upbringing', label: 'Someone raised between cultures' },
];

const SESSION_CHOICES: readonly Choice[] = [
  { key: 'online', label: 'Online' },
  { key: 'in-person', label: 'In person' },
  { label: 'Either is fine' },
];

/**
 * "Either is fine" maps to *both* formats rather than to neither.
 *
 * An empty list would be indistinguishable from having skipped the question, and
 * a future matcher deserves to know that both were acceptable.
 */
const EITHER_FORMAT_KEYS: readonly string[] = ['in-person', 'online'];

/** The order a person most likely wants languages in, before the full list. */
const LANGUAGE_PRIORITY: readonly string[] = ['en', 'hi', 'bn', 'ta', 'ml', 'ur', 'pa', 'gu'];

/**
 * Our phrasing, checked against what the database actually has.
 *
 * The interface owns the *words*; the database owns the *keys*. So a curated
 * option is offered only when its key is real — a phrase with no key behind it
 * would produce a 400 on submission, which is a worse failure than a shorter
 * list.
 *
 * What this deliberately does **not** do is append every other term the database
 * holds. Doing so was a well-meant idea and it was wrong: "What would you like
 * support with right now?" is a question with six answers, and answering it with
 * twelve — half of them the taxonomy's own words, in a different register from
 * ours — is both a worse question and a leak of the internal vocabulary this
 * interface exists to hide. A term nobody has phrased yet simply waits for
 * someone to write the words for it.
 */
function curated(
  ours: readonly Choice[],
  available: readonly { key: string }[],
): readonly Choice[] {
  const keys = new Set(available.map((term) => term.key));

  return ours.filter((choice) => choice.key === undefined || keys.has(choice.key));
}

function languageChoices(languages: readonly LanguageView[]): readonly Choice[] {
  const byCode = new Map(languages.map((language) => [language.code, language]));
  const toChoice = (code: string): Choice => ({
    code,
    label: byCode.get(code)?.name ?? code,
  });

  const shortlist = LANGUAGE_PRIORITY.filter((code) => byCode.has(code)).map(toChoice);
  const rest = languages
    .filter((language) => !LANGUAGE_PRIORITY.includes(language.code))
    .map((language) => toChoice(language.code));

  return [...shortlist, ...rest];
}

/** How many languages are shown before "show all" is needed. */
export const LANGUAGE_SHORTLIST_SIZE = LANGUAGE_PRIORITY.length;

/**
 * The choices for a question, in the product's words where we have them.
 */
export function choicesFor(id: QuestionId, vocabulary: IntakeVocabulary): readonly Choice[] {
  switch (id) {
    case 'support':
      return curated(SUPPORT_CHOICES, vocabulary.areasOfWork);
    case 'conversation':
      return curated(CONVERSATION_CHOICES, vocabulary.communicationStyles);
    case 'context':
      return [
        ...curated(CONTEXT_CHOICES, vocabulary.contextualExperience),
        { label: CLEARS_TO_NOTHING },
      ];
    case 'language':
      // The one question whose list *is* the data: there is no warmer phrasing
      // for "Malayalam", and inventing one would only obscure it.
      return languageChoices(vocabulary.languages);
    case 'sessions':
      return curated(SESSION_CHOICES, vocabulary.sessionFormats);
    case 'availability':
    case 'anything-else':
      return [];
  }
}

/** The words for a stored answer, found in the vocabulary. */
export function labelForKey(id: QuestionId, key: string, vocabulary: IntakeVocabulary): string {
  const found = choicesFor(id, vocabulary).find(
    (choice) => choice.key === key || choice.code === key,
  );

  return found?.label ?? key;
}

/** The keys an answer means. "Either is fine" means two. */
export function keysForChoice(choice: Choice): readonly string[] {
  if (choice.key !== undefined) {
    return [choice.key];
  }

  return choice.label === 'Either is fine' ? EITHER_FORMAT_KEYS : [];
}

/** Whether a choice is the one currently recorded, for reading a radio back. */
export function isChoiceChosen(choice: Choice, chosen: readonly string[]): boolean {
  const keys = keysForChoice(choice);

  return (
    keys.length > 0 && keys.length === chosen.length && keys.every((key) => chosen.includes(key))
  );
}

/** The choice a session-format answer corresponds to, for a review summary. */
export function sessionChoiceFor(
  chosen: readonly string[],
  vocabulary: IntakeVocabulary,
): Choice | undefined {
  return choicesFor('sessions', vocabulary).find((choice) => isChoiceChosen(choice, chosen));
}

/** True when the person picked "I’m not sure yet" rather than a style. */
export function isUnsureChoice(choice: Choice): boolean {
  return choice.label === 'I’m not sure yet';
}

/** True for the answers that clear the list rather than adding to it. */
/**
 * The two answers that mean "none of the above" rather than adding a term.
 *
 * They are separate answers, not vocabulary keys, and each clears the list it
 * belongs to: leaving a stale selection behind would put an answer on the review
 * screen that the person had just taken back.
 */
export const CLEARS_TO_NOTHING = 'Nothing specific comes to mind';
export const CLEARS_AREAS = 'Something else';

export function isClearingChoice(choice: Choice): boolean {
  return choice.label === CLEARS_AREAS || choice.label === CLEARS_TO_NOTHING;
}

/** Guard used by the review screen: is a draft still what a person filled in? */
export function hasAnswerFor(draft: IntakeDraft, id: QuestionId): boolean {
  switch (id) {
    case 'support':
      return draft.areasOfWork.length > 0;
    case 'conversation':
      return draft.openToGuidance || draft.communicationStyles.length > 0;
    case 'context':
      return draft.contextualExperiences.length > 0;
    case 'language':
      return draft.languages.length > 0;
    case 'sessions':
      return draft.sessionFormats.length > 0;
    case 'availability':
      return draft.days.length > 0 && draft.timeOfDay.length > 0;
    case 'anything-else':
      return draft.rawText.trim() !== '';
  }
}
