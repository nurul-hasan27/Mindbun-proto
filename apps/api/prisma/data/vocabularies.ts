/**
 * The controlled vocabularies the whole system is built on.
 *
 * These lists are the product's shared language: the words a client sees, and
 * the words a future recommendation is explained in. They are curated here
 * rather than created at runtime, so that a client preference and a therapist
 * profile can point at exactly the same row.
 *
 * Wording rule: no approach, style, area or context implies that one is better
 * than another. They are ways of working and things people bring, not rankings.
 */

export interface VocabularyEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

/** A vocabulary whose names speak for themselves and carries no description. */
export interface SimpleEntry {
  readonly key: string;
  readonly name: string;
}

/** Languages are keyed by their ISO 639-1 code, which is also the display key. */
export interface LanguageEntry {
  readonly code: string;
  readonly name: string;
}

export const languages: readonly LanguageEntry[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'ru', name: 'Russian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'mi', name: 'Māori' },
] as const;

export const therapeuticApproaches: readonly VocabularyEntry[] = [
  {
    key: 'exploratory',
    name: 'Exploratory',
    description:
      'We follow your account wherever it goes, making room for what surfaces rather than starting from a plan.',
  },
  {
    key: 'structured',
    name: 'Structured',
    description:
      'A clear frame for the work, with agreed goals and a shape you can see, for when direction helps.',
  },
  {
    key: 'solution-focused',
    name: 'Solution-focused',
    description:
      'Short, practical conversations that look for what is already going right and build on it.',
  },
  {
    key: 'reflective',
    name: 'Reflective',
    description:
      'Time to think about thinking: noticing patterns, and the effect earlier experiences still have.',
  },
  {
    key: 'integrative',
    name: 'Integrative',
    description:
      'Drawing on more than one tradition, and choosing between them according to what you need.',
  },
] as const;

export const communicationStyles: readonly VocabularyEntry[] = [
  {
    key: 'exploratory',
    name: 'Exploratory',
    description: 'Asks open questions and stays with what you bring.',
  },
  {
    key: 'structured',
    name: 'Structured',
    description: 'Keeps sessions focused and explains the plan.',
  },
  {
    key: 'warm',
    name: 'Warm',
    description: 'Steady, unhurried, and easy to talk to.',
  },
  {
    key: 'direct',
    name: 'Direct',
    description: 'Says what it sees, plainly, without softening it into nothing.',
  },
  {
    key: 'reflective',
    name: 'Reflective',
    description: 'Reflects back what it hears, so you can hear it too.',
  },
  {
    key: 'gentle',
    name: 'Gentle',
    description: 'Moves slowly, and lets you set the pace.',
  },
] as const;

export const areasOfWork: readonly VocabularyEntry[] = [
  {
    key: 'career-transitions',
    name: 'Career transitions',
    description: 'Choosing, changing direction, or deciding a job is finished.',
  },
  {
    key: 'relationships',
    name: 'Relationships',
    description: 'Partnerships, friendships, and the patterns between people.',
  },
  {
    key: 'life-transitions',
    name: 'Life transitions',
    description: 'The in-between years: leaving, arriving, becoming someone new.',
  },
  {
    key: 'work-stress',
    name: 'Work stress',
    description: 'Pressure at work, and what it does to the rest of your life.',
  },
  {
    key: 'family-dynamics',
    name: 'Family dynamics',
    description: 'Expectations, roles and distance within a family.',
  },
  {
    key: 'identity-exploration',
    name: 'Identity exploration',
    description: 'Working out who you are when the old answers stopped fitting.',
  },
  {
    key: 'adjustment-to-relocation',
    name: 'Adjustment to relocation',
    description: 'Landing somewhere new, and finding your way in it.',
  },
  {
    key: 'grief-and-loss',
    name: 'Grief and loss',
    description: 'Loss of a person, a place, a role, or a version of yourself.',
  },
  {
    key: 'burnout',
    name: 'Burnout',
    description: 'Running on empty, and the exhaustion that comes with it.',
  },
  {
    key: 'self-worth',
    name: 'Self-worth',
    description: 'How you value yourself, and what you believe you deserve.',
  },
  {
    key: 'parenting',
    name: 'Parenting',
    description: 'Raising children, at any age, including adult children.',
  },
  {
    key: 'creative-practice',
    name: 'Creative practice',
    description: 'Making things, and the block that comes with it.',
  },
] as const;

export const contextualExperience: readonly VocabularyEntry[] = [
  {
    key: 'indian-diaspora',
    name: 'Indian diaspora',
    description: 'Grew up, or lives, somewhere in the Indian diaspora.',
  },
  {
    key: 'cross-cultural-relationships',
    name: 'Cross-cultural relationships',
    description: 'Works with people across cultural and linguistic divides.',
  },
  {
    key: 'relocation',
    name: 'Relocation',
    description: 'Has moved countries, or between very different places.',
  },
  {
    key: 'international-students',
    name: 'International students',
    description: 'Has worked with, or been, an international student.',
  },
  {
    key: 'family-expectations',
    name: 'Family expectations',
    description: 'Has navigated expectations from a family that meant well.',
  },
  {
    key: 'third-culture-upbringing',
    name: 'Third-culture upbringing',
    description: 'Raised between cultures, belonging to more than one place.',
  },
  {
    key: 'working-across-cultures',
    name: 'Working across cultures',
    description: 'Works regularly with colleagues and clients from other cultures.',
  },
] as const;

export const sessionFormats: readonly SimpleEntry[] = [
  { key: 'online', name: 'Online' },
  { key: 'in-person', name: 'In person' },
] as const;

/**
 * The reasons someone can pick from after a recommendation did not feel right.
 *
 * Three rules shaped this list, and each cost something:
 *
 * 1. **Only reasons the engine can act on.** `location-mismatch` was in the Phase 2
 *    vocabulary and is deliberately gone. This phase does no geographic matching — a
 *    `TherapistProfile.location` is a display string, not a structured attribute the
 *    engine may compare — so offering it would collect something the system could not
 *    use, and the person would reasonably assume it changed the next search. It did
 *    not. A reason we cannot act on is worse than no reason, because it is a promise
 *    with nothing behind it.
 *
 * 2. **The key is the contract; the name is copy.** Everything that consumes feedback
 *    reads `key`. `name` is expected to be rewritten by a copywriter and nothing may
 *    depend on it.
 *
 * 3. **Every name is written from the person who answered it**, and none of them is a
 *    verdict on the therapist. "The timing didn't work for me" is a report; "wrong
 *    format" was a judgement, and it is gone for the same reason `sentiment` was.
 *
 * `feedbackToSignals` decides what each key does. Three of these — `felt-uncomfortable`
 * and `other` among them — deliberately do *less* than someone might expect, and the
 * reasons why are in that file rather than here.
 */
export const feedbackReasons: readonly VocabularyEntry[] = [
  {
    key: 'communication-mismatch',
    name: 'The communication style didn\u2019t feel right.',
    description: 'The way they talked did not feel like what you were after.',
  },
  {
    key: 'different-experience',
    name: 'I wanted someone with different experience.',
    description: 'You were hoping for a different kind of background or context.',
  },
  {
    key: 'not-the-right-approach',
    name: 'The way they work did not suit me.',
    description: 'Their approach was not the one you were looking for.',
  },
  {
    key: 'felt-uncomfortable',
    name: 'I did not feel understood.',
    description: 'The session did not feel like a fit to talk in.',
  },
  {
    key: 'availability-mismatch',
    name: 'The timing did not work for me.',
    description: 'There was no workable time for both of you.',
  },
  {
    key: 'language-mismatch',
    name: 'I would prefer someone who speaks another language.',
    description: 'Getting the words out was harder than it should have been.',
  },
  {
    key: 'format-mismatch',
    name: 'I would prefer a different session format.',
    description: 'You wanted a different kind of session.',
  },
  {
    key: 'other',
    name: 'Something else.',
    description: 'Something else, which you can put into your own words.',
  },
] as const;
