/**
 * What a suggestion is allowed to be, and what happens to it if someone keeps it.
 *
 * ## Why this file exists separately from the provider
 *
 * A provider is handed a vocabulary and asked to return keys from it. Whether a returned
 * key is *real*, and where in the existing intake it belongs, are questions about the
 * product's data model rather than about the model that answered. Keeping them here means:
 *
 * - `mockAiProvider` does not validate itself, and the real provider does not validate
 *   itself, and neither can be edited into disagreeing with the other.
 * - The rule is testable on its own, without a provider, a database or a network.
 * - A key that is not real is **dropped and reported**, never stored and never rendered as
 *   though it had been understood.
 *
 * ## The mapping, and why `approach` is an alias
 *
 * `IntakeDraft` has five vocabulary families and two flags. It has no sixth field for a
 * therapeutic approach, and this phase does not add one — a second place for an answer is
 * exactly the "competing intake state" the existing draft exists to prevent.
 *
 * So `approach` and `communicationStyle` both resolve to `communicationStyles`. The two
 * vocabularies genuinely do overlap (`exploratory`, `reflective` and `structured` are in
 * both), and the intake asks one question — the kind of conversation that helps — which is
 * where a person's words about wanting to explore rather than be given a plan belong. A key
 * that exists only in `therapeutic_approaches`, such as `integrative`, is therefore not
 * committable; it is reported in `notUnderstood` so the interface can say so rather than
 * dropping it in silence. See `resolveTarget`.
 */

import {
  SIGNAL_CATEGORIES,
  type AiSignal,
  type AiSignalCategory,
  type AiSignalConfidence,
} from './aiProvider.js';

/** The vocabulary the intake actually holds, as the repository returns it. */
export interface IntakeVocabularyView {
  readonly areasOfWork: readonly { readonly key: string; readonly name: string }[];
  readonly communicationStyles: readonly { readonly key: string; readonly name: string }[];
  readonly contextualExperience: readonly { readonly key: string; readonly name: string }[];
  readonly languages: readonly { readonly code: string; readonly name: string }[];
  readonly sessionFormats: readonly { readonly key: string; readonly name: string }[];
}

/** The `IntakeDraft` fields a suggestion can write to. Mirrors `apps/web/src/lib/intake/draft.ts`. */
export const DRAFT_FIELDS = [
  'areasOfWork',
  'communicationStyles',
  'contextualExperiences',
  'languages',
  'sessionFormats',
] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];

/** What the client should do with a suggestion if the person keeps it. */
export type SuggestionTarget =
  | { readonly kind: 'draft'; readonly field: DraftField; readonly label: string }
  /** `openToGuidance`. The one boolean in the draft an assistant may ever propose. */
  | { readonly kind: 'guidance'; readonly label: string }
  /**
   * A pre-fill for the availability question.
   *
   * Deliberately a hint rather than a write: someone who says "evenings" has not told us a
   * day, and the availability question is a grid of days and times that a suggestion has no
   * business filling in. The interface offers these as choices on that question.
   */
  | {
      readonly kind: 'availabilityHint';
      readonly part: 'morning' | 'afternoon' | 'evening' | null;
      readonly days: readonly DayName[];
      readonly label: string;
    }
  /** Understood, said out loud, and with nowhere in the intake to go. */
  | { readonly kind: 'note-only'; readonly label: string };

export const DAY_NAMES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type DayName = (typeof DAY_NAMES)[number];

export const TIME_PARTS = ['morning', 'afternoon', 'evening'] as const;

export type TimeOfDay = (typeof TIME_PARTS)[number];

/** The key a `guidance` suggestion must carry. The only one there is. */
export const OPEN_TO_GUIDANCE_KEY = 'open-to-guidance';

/**
 * How many suggestions are worth showing. Beyond this it is a transcript, not a summary.
 *
 * Eight is a page, not a list. A person asked to approve twenty things approves them.
 */
export const MAX_SIGNALS = 8;

/**
 * How many entries from a provider are examined.
 *
 * Twice the cap, and separate from it: the surplus beyond the cap has to be *counted and
 * reported*, and it can only be counted by looking at it.
 */
const MAX_INSPECT = 24;

/** Long enough for one honest sentence about someone's preferences, short enough to be one. */
export const MAX_EXPLANATION_LENGTH = 240;

/**
 * Category → vocabulary family, or `null` for the two categories that are not vocabularies.
 *
 * A single place, so the validator, the interface and the documentation cannot disagree
 * about where a suggestion lands.
 */
export const CATEGORY_FAMILY: Readonly<
  Record<AiSignalCategory, 'areasOfWork' | 'communicationStyles' | 'contextualExperience' | 'languages' | 'sessionFormats' | null>
> = {
  area: 'areasOfWork',
  // An alias, not a second destination. See the note at the top of this file.
  approach: 'communicationStyles',
  communicationStyle: 'communicationStyles',
  context: 'contextualExperience',
  language: 'languages',
  sessionFormat: 'sessionFormats',
  availability: null,
  guidance: null,
};

/**
 * Vocabulary family → the draft field it writes to.
 *
 * Separate from `CATEGORY_FAMILY` because the two names are not the same, and one of them
 * differs by a letter: the vocabulary endpoint calls it `contextualExperience` and the draft
 * calls it `contextualExperiences`. An inline cast would have hidden that, and the day the
 * two ever diverge further the mistake would ship silently. This table is the whole
 * translation, so there is exactly one place to be wrong.
 */
const FAMILY_DRAFT_FIELD: Readonly<Record<Exclude<keyof IntakeVocabularyView, 'never'>, DraftField>> = {
  areasOfWork: 'areasOfWork',
  communicationStyles: 'communicationStyles',
  contextualExperience: 'contextualExperiences',
  languages: 'languages',
  sessionFormats: 'sessionFormats',
};

function isCategory(value: unknown): value is AiSignalCategory {
  return typeof value === 'string' && (SIGNAL_CATEGORIES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is AiSignalConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** Every real key in a family, from the database rather than from this file. */
function keysOf(
  family: keyof IntakeVocabularyView,
  vocabulary: IntakeVocabularyView,
): ReadonlyMap<string, string> {
  if (family === 'languages') {
    return new Map(vocabulary.languages.map((entry) => [entry.code, entry.name] as const));
  }

  return new Map(vocabulary[family].map((entry) => [entry.key, entry.name] as const));
}

export interface AvailabilityHint {
  readonly part: 'morning' | 'afternoon' | 'evening' | null;
  readonly days: readonly DayName[];
}

/**
 * The compact key form for a time hint: `hint:<part>:<days>`.
 *
 * `part` may be `any`; `days` is an `-` joined list of day constants, or `any`. Both are
 * parsed rather than pattern-matched, so a provider cannot smuggle a sentence in through
 * the key and have it rendered.
 */
export function parseAvailabilityHint(key: string): AvailabilityHint | null {
  const parts = key.split(':');

  if (parts.length !== 3 || parts[0] !== 'hint') {
    return null;
  }

  const [, rawPart, rawDays] = parts;

  const part =
    rawPart === 'any'
      ? null
      : (TIME_PARTS as readonly string[]).includes(rawPart ?? '')
        ? (rawPart as 'morning' | 'afternoon' | 'evening')
        : undefined;

  if (part === undefined) {
    return null;
  }

  if (rawDays === 'any') {
    return { part, days: [] };
  }

  const days: DayName[] = [];

  for (const day of (rawDays ?? '').split('-')) {
    if (!(DAY_NAMES as readonly string[]).includes(day)) {
      return null;
    }

    days.push(day as DayName);
  }

  return days.length === 0 ? null : { part, days };
}

/** The canonical spelling, so two providers cannot produce two keys for the same answer. */
export function formatAvailabilityHint(hint: AvailabilityHint): string {
  return `hint:${hint.part ?? 'any'}:${hint.days.length === 0 ? 'any' : hint.days.join('-')}`;
}

function prettyDays(days: readonly DayName[]): string {
  const names: Record<DayName, string> = {
    MONDAY: 'Mondays',
    TUESDAY: 'Tuesdays',
    WEDNESDAY: 'Wednesdays',
    THURSDAY: 'Thursdays',
    FRIDAY: 'Fridays',
    SATURDAY: 'Saturdays',
    SUNDAY: 'Sundays',
  };

  return days.map((day) => names[day]).join(', ');
}

function prettyPart(part: 'morning' | 'afternoon' | 'evening'): string {
  return part === 'morning' ? 'Mornings' : part === 'afternoon' ? 'Afternoons' : 'Evenings';
}

/**
 * Where a validated suggestion would land, and what to call it.
 *
 * `null` when the key is real but has no home — which can only happen for `guidance` and
 * `availability`, since a vocabulary key always has its family. Callers turn `null` into a
 * reported rejection rather than a broken control.
 */
export function resolveTarget(
  signal: Pick<AiSignal, 'category' | 'key'>,
  vocabulary: IntakeVocabularyView,
): SuggestionTarget | null {
  if (signal.category === 'guidance') {
    if (signal.key !== OPEN_TO_GUIDANCE_KEY) {
      return null;
    }

    return { kind: 'guidance', label: 'You are not sure yet' };
  }

  if (signal.category === 'availability') {
    const hint = parseAvailabilityHint(signal.key);

    if (hint === null) {
      return null;
    }

    const when =
      hint.days.length === 0
        ? (hint.part === null ? '' : prettyPart(hint.part))
        : hint.part === null
          ? prettyDays(hint.days)
          : `${prettyDays(hint.days)} ${prettyPart(hint.part).toLowerCase()}`;

    return { kind: 'availabilityHint', part: hint.part, days: hint.days, label: when };
  }

  const family = CATEGORY_FAMILY[signal.category];

  // `null` for availability and guidance, both of which returned above. Kept as an explicit
  // refusal rather than a cast, so adding a third non-vocabulary category later is a
  // compile error here instead of a runtime `undefined` two lines down.
  if (family === null) {
    return null;
  }

  const name = keysOf(family, vocabulary).get(signal.key);

  if (name === undefined) {
    return null;
  }

  return { kind: 'draft', field: FAMILY_DRAFT_FIELD[family], label: name };
}

/** A suggestion as it travels to the browser, with its destination decided here. */
export interface ValidatedSignal extends AiSignal {
  readonly target: SuggestionTarget;
}

export interface SignalValidation {
  readonly signals: readonly ValidatedSignal[];
  /**
   * Keys that were dropped, with the category they came under.
   *
   * Reported rather than swallowed. An assistant that quietly discarded what a person said
   * would be lying by omission, and "I could not place integrative — the intake has no
   * question about approaches" is a true and useful thing to be told.
   */
  readonly notUnderstood: readonly { readonly category: AiSignalCategory; readonly key: string }[];
  /**
   * Real suggestions there was no room for.
   *
   * A *different* claim from `notUnderstood` — these were understood and simply did not fit.
   * They are reported for the same reason: a list that has been silently cut to eight
   * presents itself as the whole of what was understood, and it is not. The interface can
   * say "that is what I picked up, and there was more" without pretending to have failed.
   */
  readonly surplus: readonly { readonly category: AiSignalCategory; readonly key: string }[];
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Take whatever a provider returned and return only what the product can stand behind.
 *
 * ## The design rule: reject, never repair
 *
 * A key that is not in the vocabulary is dropped, not fuzzy-matched to the closest real one.
 * Someone who said "grief" must not end up with `self-worth` because it was the nearest
 * string — the whole value of this feature is that the person is shown exactly what was
 * understood so they can correct it, and a guess is uncorrectable from their side.
 *
 * ## Why this takes `unknown`
 *
 * Because a real model's output is `unknown` until something has checked it, and typing the
 * parameter as `readonly AiSignal[]` would put the check somewhere it can be forgotten. The
 * cast to `AiSignal` happens once, at the bottom, and only after every field has been
 * individually verified against the vocabulary above.
 */
export function validateSignals(
  raw: unknown,
  vocabulary: IntakeVocabularyView,
): SignalValidation {
  if (!Array.isArray(raw)) {
    return { signals: [], notUnderstood: [], surplus: [] };
  }

  const signals: ValidatedSignal[] = [];
  const notUnderstood: { category: AiSignalCategory; key: string }[] = [];
  const surplus: { category: AiSignalCategory; key: string }[] = [];
  const seen = new Set<string>();

  // The whole list is examined rather than the first `MAX_SIGNALS`. Stopping early would
  // leave the rest unexamined and therefore unreportable, and "there was more than I could
  // show" is a sentence the interface can say while "these are all of it" is a lie.
  for (const entry of raw.slice(0, MAX_INSPECT)) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const category = candidate['category'];
    const key = readString(candidate['key']);

    if (!isCategory(category) || key === null) {
      continue;
    }

    // The source is fixed by the product, not by the model. If a provider says anything
    // else it has either misunderstood or is reaching for an inference this product does
    // not make, and neither is worth guessing at.
    if (candidate['source'] !== 'user_message') {
      continue;
    }

    const confidence = candidate['confidence'];
    const explanation = readString(candidate['explanation']);

    if (!isConfidence(confidence) || explanation === null) {
      continue;
    }

    const id = `${category}:${key}`;

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    const target = resolveTarget({ category, key }, vocabulary);

    if (target === null) {
      notUnderstood.push({ category, key });
      continue;
    }

    // Trim rather than reject. A long explanation is a verbose one, not a wrong one, and
    // dropping a correct suggestion over wordiness would be a worse failure than shortening
    // a sentence. It is collapsed to plain text on the way in, so no markup can survive.
    if (signals.length >= MAX_SIGNALS) {
      surplus.push({ category, key });
      continue;
    }

    signals.push({
      category,
      key,
      confidence,
      source: 'user_message',
      explanation: collapseToText(explanation).slice(0, MAX_EXPLANATION_LENGTH),
      target,
    });
  }

  return { signals, notUnderstood, surplus };
}

/**
 * Strip anything that could render as markup, and flatten the rest to single-spaced text.
 *
 * The interface renders suggestions as text nodes and never uses `dangerouslySetInnerHTML`,
 * so this is belt-and-braces rather than the control. It is here because "the renderer
 * cannot execute it" and "the bytes never contained it" are different guarantees, and the
 * second is the one that survives someone adding `dangerouslySetInnerHTML` in a hurry two
 * phases from now.
 */
export function collapseToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
