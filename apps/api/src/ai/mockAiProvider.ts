import {
  AiUnavailableError,
  type AiCaseContext,
  type AiCaseSummary,
  type AiKnownAnswers,
  type AiMessage,
  type AiProvider,
  type AiSignal,
  type AiSignalCategory,
  type AiTurn,
} from './aiProvider.js';
import { NEED_CATEGORIES } from './caseContext.js';
import {
  OPEN_TO_GUIDANCE_KEY,
  formatAvailabilityHint,
  type DayName,
  type IntakeVocabularyView,
  type TimeOfDay,
} from './signalVocabulary.js';

/**
 * A deterministic assistant, with no model behind it.
 *
 * ## This is not a stub
 *
 * It is the provider that runs whenever there is no key, and most reviewers of this
 * prototype will never have one — so it has to carry the whole flow convincingly. It does
 * real work: it reads the vocabulary the database actually holds, matches a person's words
 * against the names in it, and produces the same shape a model would.
 *
 * ## Why keyword matching is the right amount of intelligence here
 *
 * The suggestions are matched against **vocabulary names read from the database**, not a
 * hand-written list of terms. A term added to the seed is searched the moment it exists,
 * with no change here — which is why the tables below are keyed by vocabulary key and hold
 * only the *phrases a person might use*, never the terms themselves.
 *
 * The honest limitation, and the docs say so too: this understands the words someone uses
 * *about* their preferences, and nothing else. It does not read "I've been a wreck since my
 * mother died" as grief and loss, and it will not pretend to. A model does. That difference
 * is the entire reason the abstraction exists.
 *
 * ## Determinism
 *
 * A pure function of its arguments. The same transcript always produces the same turn and
 * the same suggestions, which is what makes the tests above it worth writing.
 */

/** How many of the person's messages we read before the assistant stops asking. */
const MIN_MESSAGES_BEFORE_SUMMARISING = 2;

/** Below this many understood signals, another question is worth more than a summary. */
const MIN_SIGNALS_TO_SUMMARISE = 2;

/**
 * How many suggestions of one kind are worth showing.
 *
 * Two, and the reasoning is in `limitPerCategory`. A third and fourth way of saying
 * "something about work" crowd out the one thing that was said about a language, a format
 * or a time — which is the part a person cannot guess the assistant has missed.
 */
const MAX_PER_CATEGORY = 2;

// ---------------------------------------------------------------------------
// The phrases a person might use.
//
// Keyed by vocabulary key so a renamed or retried term is a visible mismatch here rather
// than a silent no-match. A key that no longer exists simply has no entry and falls back to
// matching the name's own words, which is a plainer but still correct behaviour.
// ---------------------------------------------------------------------------

/** Areas of work. */
const AREA_CUES: Readonly<Record<string, readonly string[]>> = {
  'adjustment-to-relocation': [
    'relocat',
    'moved to',
    'moved here',
    'new country',
    'new city',
    'away from home',
    'left my home',
    'settle down',
  ],
  burnout: [
    'burnout',
    'burnt out',
    'burned out',
    'exhausted',
    'no energy left',
    'running on empty',
    'nothing left in the tank',
    'cannot face',
  ],
  'career-transitions': [
    'career',
    'job',
    'work',
    'workplace',
    'office',
    'boss',
    'manager',
    'promotion',
    'promoted',
    'new role',
    'redundan',
    'laid off',
    'unemploy',
    'retire',
    'what i want to do next',
  ],
  'creative-practice': [
    'creative',
    'writing',
    'music',
    'painting',
    'photograph',
    'illustration',
    'design',
    'making things',
    'portfolio',
  ],
  'family-dynamics': [
    'family',
    'my parents',
    'my mother',
    'my father',
    'my mum',
    'my mom',
    'my dad',
    'my sister',
    'my brother',
    'my siblings',
    'in-laws',
    'relatives',
  ],
  'grief-and-loss': [
    'grief',
    'grieving',
    'died',
    'death',
    'passed away',
    'loss',
    'funeral',
    'bereav',
    'no longer here',
  ],
  'identity-exploration': [
    'identity',
    'who i am',
    'belonging',
    'fitting in',
    'outsider',
    'lost my way',
    'purpose',
    'what my life is about',
    'values',
  ],
  'life-transitions': [
    'transition',
    'starting over',
    'new chapter',
    'big change',
    'life change',
    'changing',
  ],
  parenting: [
    'parenting',
    'my child',
    'my children',
    'my son',
    'my daughter',
    'my kids',
    'raising',
    'teenager',
    'teen',
    'my baby',
    'infant',
    'toddler',
  ],
  relationships: [
    'relationship',
    'my partner',
    'marriage',
    'divorce',
    'boyfriend',
    'girlfriend',
    'my spouse',
    'my wife',
    'my husband',
    'couple',
    'dating',
    'separation',
    'break up',
    'broke up',
  ],
  'self-worth': [
    'self-worth',
    'self worth',
    'confidence',
    'self-esteem',
    'not good enough',
    'impostor',
    'imposter',
    'believe in myself',
    'worthless',
    'hard on myself',
  ],
  'work-stress': [
    'stress',
    'pressure',
    'stressed',
    'deadline',
    'deadlines',
    'overwhelmed',
    'overcommitted',
    'workload',
    'too much on',
    'long hours',
    'racing',
  ],
};

/** Conversation style. The most valuable thing to get right — a person here is being precise. */
const STYLE_CUES: Readonly<Record<string, readonly string[]>> = {
  exploratory: [
    'explore',
    'talk it through',
    'talk things through',
    'think out loud',
    'figure out',
    'work it out',
    'questions',
    'curious',
    'rambl',
    'not sure what',
  ],
  structured: [
    'structured',
    'a plan',
    'steps',
    'homework',
    'exercises',
    'goals',
    'practical',
    'actionable',
    'systematic',
    'step by step',
  ],
  warm: ['warm', 'kind', 'gentle', 'safe', 'comfortable', 'listening', 'caring', 'soft'],
  direct: [
    'direct',
    'straight',
    'honest',
    'say it',
    'blunt',
    'no fuss',
    'straightforward',
    'plain',
  ],
  reflective: ['reflect', 'reflective', 'think about', 'meaning', 'mirror back', 'looking back'],
  gentle: ['gentle', 'slow', 'at my pace', 'patient', 'not pushed', 'no rush', 'take it slow'],
};

/** Contextual experience — the things about someone's situation that change what helps. */
const CONTEXT_CUES: Readonly<Record<string, readonly string[]>> = {
  'cross-cultural-relationships': [
    'cross-cultural',
    'different culture',
    'in-laws',
    'mixed marriage',
    'two cultures',
    'partner from',
  ],
  'family-expectations': [
    // `expect` rather than `expectations`, because the sentence almost never uses the
    // vocabulary's own noun: it says "what my family expects from me".
    'expect',
    'family pressure',
    'pressure from family',
    'disappointing',
    'let down',
    'not living up to',
    'they want me to',
    'guilt',
    'guilty',
    'pushing me',
    'keep asking',
    'keep asking when',
    'when i am going to',
    "when i'm going to",
    'settle down',
  ],
  'indian-diaspora': [
    'diaspora',
    'indian',
    'hindi',
    'desi',
    'temple',
    'joint family',
    'india',
    'bengali',
    'tamil',
    'punjabi',
    'gujarati',
    'telugu',
    'malayalam',
    'kannada',
    'urdu',
  ],
  'international-students': [
    'student',
    'university',
    'studying',
    'studies',
    'master',
    'phd',
    'postgrad',
    'college',
    'degree',
    'campus',
    'exchange year',
    'thesis',
  ],
  relocation: [
    'moved to',
    'moved here',
    'new country',
    'new city',
    'abroad',
    'immigrat',
    'visa',
    'expat',
    'left home',
    'away from my family',
  ],
  'third-culture-upbringing': [
    'third culture',
    'raised between',
    'two countries',
    'grew up in',
    'moved as a child',
    'childhood move',
  ],
  'working-across-cultures': [
    'cultures',
    'across cultures',
    'bilingual',
    'intercultural',
    'different cultures',
    'people from all over',
  ],
};

const FORMAT_CUES: Readonly<Record<string, readonly string[]>> = {
  online: ['online', 'video', 'remote', 'zoom', 'from home', 'at home', 'over a call', 'call'],
  'in-person': ['in person', 'in-person', 'face to face', 'face-to-face', 'in the room', 'meet up'],
};

/** Language codes, so a match is a real vocabulary key rather than a word we invented. */
const LANGUAGE_CUES: Readonly<Record<string, readonly string[]>> = {
  af: ['afrikaans'],
  ar: ['arabic', 'عربي'],
  bn: ['bengali', 'bangla', 'বাংলা'],
  de: ['german', 'deutsch'],
  en: ['english'],
  es: ['spanish', 'español', 'espanol'],
  fr: ['french', 'français', 'francais'],
  gu: ['gujarati', 'ગુજરાતી'],
  hi: ['hindi', 'हिंदी'],
  kn: ['kannada', 'ಕನ್ನಡ'],
  ml: ['malayalam', 'മലയാളം'],
  mr: ['marathi', 'मराठी'],
  pa: ['punjabi', 'ਪੰਜਾਬੀ'],
  pt: ['portuguese', 'português', 'portugues'],
  ru: ['russian', 'русский'],
  sv: ['swedish', 'svenska'],
  ta: ['tamil', 'தமிழ்'],
  te: ['telugu', 'తెలుగు'],
  tr: ['turkish', 'türkçe'],
  ur: ['urdu', 'اردو'],
  zh: ['mandarin', 'chinese', '中文'],
};

const TIME_CUES: readonly { pattern: RegExp; part: TimeOfDay }[] = [
  { pattern: /\b(mornings?|early)\b/i, part: 'morning' },
  { pattern: /\b(afternoons?|lunchtime|midday)\b/i, part: 'afternoon' },
  { pattern: /\b(evenings?|after work|at night|night time)\b/i, part: 'evening' },
];

const DAY_CUES: readonly { pattern: RegExp; day: DayName }[] = [
  { pattern: /\bmondays?\b/i, day: 'MONDAY' },
  { pattern: /\b(tuesdays?|tues)\b/i, day: 'TUESDAY' },
  { pattern: /\b(wednesdays?|weds)\b/i, day: 'WEDNESDAY' },
  { pattern: /\b(thursdays?|thurs|thurds?)\b/i, day: 'THURSDAY' },
  { pattern: /\bfridays?\b/i, day: 'FRIDAY' },
  { pattern: /\b(saturdays?|sats?)\b/i, day: 'SATURDAY' },
  { pattern: /\b(sundays?|suns?)\b/i, day: 'SUNDAY' },
];

// ---------------------------------------------------------------------------
// What the assistant says. Defined before the provider so the order of the file
// matches the order a reader meets it in.
// ---------------------------------------------------------------------------

/** Opens with this, and only ever says the rules once. */
const GREETING =
  'You do not need to know what kind of therapy you need, or any of the words therapists ' +
  'use for it. Tell me in your own words what has been going on.';

const SUMMARY_LEAD =
  'Here is what I have understood. Nothing has been saved yet — you can keep any of it, ' +
  'change it, or say it is not quite right.';

const NOTHING_UNDERSTOOD =
  'I am not sure I have caught anything specific yet, and I would rather ask again than ' +
  'guess.';

const FALLBACK_QUESTION = 'Is there anything you would like me to know?';

/**
 * One question per family, asked at most once each.
 *
 * Each is a real question a person could answer in a sentence, and none of them asks for
 * something the intake cannot store. Ordered by how much it would help to know, which is
 * also the order they are asked in when nothing else distinguishes them.
 */
const FAMILY_QUESTIONS = [
  {
    id: 'areasOfWork',
    ask: 'What is it mostly about, when you think about it?',
  },
  {
    id: 'communicationStyles',
    ask: 'How would you rather talk about it — would you want to explore it, or have something more practical to work through?',
  },
  {
    id: 'contextualExperience',
    ask: 'Is there anything about your background or your situation that seems relevant to this?',
  },
  {
    id: 'sessionFormats',
    ask: 'Would you rather meet online, or in person?',
  },
  {
    id: 'languages',
    ask: 'Would you rather talk in a language other than English?',
  },
] as const satisfies readonly { id: string; ask: string }[];

/**
 * The vocabulary, read when it is needed.
 *
 * A thunk rather than a value, for one reason: `buildApp` is synchronous, and a provider
 * built at start-up with a vocabulary read inside it would either need an async boot or a
 * vocabulary that could be stale by the time somebody uses it. Resolving it per call costs
 * one indexed query on tables the intake page already reads, and buys the property that
 * matters — a term renamed in the database is reflected immediately, with no restart.
 */
export type ReadVocabulary = () => Promise<IntakeVocabularyView>;

export function createMockAiProvider(readVocabulary: ReadVocabulary): AiProvider {
  return {
    name: 'mock',
    available: true,

    async nextTurn(messages: readonly AiMessage[], known: AiKnownAnswers): Promise<AiTurn> {
      const fromUser = messages.filter((message) => message.role === 'user');
      const said = fromUser.map((message) => message.text).join(' \n ');

      // Nothing from them yet: open, and explain the rules. This is the only message that
      // does that, because it is the only one where a person has not yet decided whether to
      // trust what they are typing into.
      if (fromUser.length === 0) {
        return { reply: GREETING, readyToSummarise: false };
      }

      const signals = suggest(said, await readVocabulary());
      const askedAll = everyFamilyAnswered(known);
      const enough =
        fromUser.length >= MIN_MESSAGES_BEFORE_SUMMARISING &&
        signals.length >= MIN_SIGNALS_TO_SUMMARISE;

      if (enough || (askedAll && signals.length > 0)) {
        return { reply: SUMMARY_LEAD, readyToSummarise: true };
      }

      // The intake has enough to work with in every other sense, so the next question is
      // about whichever family is still empty rather than about what was just said.
      const next = FAMILY_QUESTIONS.find((entry) => !isAnswered(known, entry.id));

      if (next !== undefined) {
        return { reply: next.ask, readyToSummarise: false };
      }

      // Everything has been asked and not enough came back. Say so, rather than summarising
      // two weak guesses and calling it an understanding.
      return {
        reply: `${NOTHING_UNDERSTOOD}\n\n${FALLBACK_QUESTION}`,
        readyToSummarise: signals.length > 0,
      };
    },

    async extractSignals(messages: readonly AiMessage[]): Promise<readonly AiSignal[]> {
      const said = messages
        .filter((message) => message.role === 'user')
        .map((message) => message.text)
        .join(' \n ');

      return suggest(said, await readVocabulary()).map((entry) => ({
        ...entry,
        source: 'user_message' as const,
      }));
    },

    // A function rather than an `async` one: it reads no vocabulary and touches no network,
    // so there is nothing to await. Declared as returning a promise because that is the port.
    summariseCase(context: AiCaseContext): Promise<AiCaseSummary> {
      return Promise.resolve(summarise(context));
    },
  };
}

function isAnswered(known: AiKnownAnswers, family: string): boolean {
  const values: Record<string, readonly string[] | boolean | undefined> = {
    areasOfWork: known.areasOfWork,
    communicationStyles: known.communicationStyles,
    contextualExperience: known.contextualExperience,
    sessionFormats: known.sessionFormats,
    languages: known.languages,
  };

  const value = values[family];

  if (value === undefined) {
    return false;
  }

  return typeof value === 'boolean' ? value : value.length > 0;
}

/** True when the intake already has an answer for every family we would ask about. */
function everyFamilyAnswered(known: AiKnownAnswers): boolean {
  return FAMILY_QUESTIONS.every((entry) => isAnswered(known, entry.id));
}

interface Suggestion {
  readonly category: AiSignalCategory;
  readonly key: string;
  readonly confidence: AiSignal['confidence'];
  readonly explanation: string;
  /**
   * How much evidence this rests on, as the length of the phrase that matched.
   *
   * Only used to decide what survives `limitPerCategory`, and never sent: a person's
   * confidence in a suggestion should not depend on being able to see how a keyword matcher
   * scored it.
   */
  readonly strength: number;
}

/** The whole of the interpretation. A pure function of what the person said. */
function suggest(said: string, vocabulary: IntakeVocabularyView): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();

  // Lowered once, here, and passed down. It used to live in a module-level variable shared
  // by every caller, which was both wrong under concurrent requests — two people typing at
  // once would read each other's words — and, in the version before that, never assigned at
  // all, so every lookup returned "no match". A parameter is the only version that is both
  // correct and obvious.
  const text = said.toLowerCase();

  const add = (entry: Suggestion): void => {
    const id = `${entry.category}:${entry.key}`;

    if (seen.has(id)) {
      return;
    }

    seen.add(id);
    out.push(entry);
  };

  for (const area of vocabulary.areasOfWork) {
    const hit = cueFor(text, area.key, area.name, AREA_CUES);

    if (hit !== null) {
      add({
        strength: hit.strength,
        category: 'area',
        key: area.key,
        confidence: hit.explicit ? 'high' : 'medium',
        explanation: `You mentioned something that sounds like ${lower(area.name)}.`,
      });
    }
  }

  for (const style of vocabulary.communicationStyles) {
    const hit = cueFor(text, style.key, style.name, STYLE_CUES);

    if (hit !== null) {
      add({
        strength: hit.strength,
        category: 'communicationStyle',
        key: style.key,
        confidence: hit.explicit ? 'high' : 'medium',
        explanation: `From how you described it, ${lower(style.name)} conversations sound like what would help.`,
      });
    }
  }

  // Phrases like "my parents keep asking" land here rather than in areas, because what
  // matters is the situation around them and not the topic.
  for (const context of vocabulary.contextualExperience) {
    const hit = cueFor(text, context.key, context.name, CONTEXT_CUES);

    if (hit !== null) {
      add({
        strength: hit.strength,
        category: 'context',
        key: context.key,
        confidence: hit.explicit ? 'high' : 'medium',
        explanation: `Something about ${lower(context.name)} seems relevant to you.`,
      });
    }
  }

  for (const format of vocabulary.sessionFormats) {
    const hit = cueFor(text, format.key, format.name, FORMAT_CUES);

    if (hit !== null) {
      add({
        strength: hit.strength,
        category: 'sessionFormat',
        key: format.key,
        confidence: hit.explicit ? 'high' : 'medium',
        explanation: `You said ${lower(format.name)} sessions would suit you.`,
      });
    }
  }

  for (const language of vocabulary.languages) {
    const hit = cueFor(text, language.code, language.name, LANGUAGE_CUES);

    if (hit !== null) {
      add({
        strength: hit.strength,
        category: 'language',
        key: language.code,
        confidence: hit.explicit ? 'high' : 'medium',
        explanation: `You would rather speak ${language.name}.`,
      });
    }
  }

  // Times are only ever a hint. Someone who said "evenings" has not told us a day, and
  // writing a day for them would put words in their mouth on a page that then says "you
  // told us". The availability question stays a question.
  const part = TIME_CUES.find((cue) => cue.pattern.test(text))?.part ?? null;
  const days = DAY_CUES.filter((cue) => cue.pattern.test(text)).map((cue) => cue.day);

  if (part !== null || days.length > 0) {
    const when = describeWhen(part, days);

    add({
      strength: 0,
      category: 'availability',
      key: formatAvailabilityHint({ part, days }),
      confidence: 'low',
      explanation: `${when} sounded like it might suit you.`,
    });
  }

  // "I don't know" is a real answer, and the intake has a key for it.
  if (
    /\b(do ?n'?t know|not sure|unsure|no idea|whatever you (?:think|recommend)|guide me|surprise me)\b/i.test(
      text,
    )
  ) {
    add({
      strength: 0,
      category: 'guidance',
      key: OPEN_TO_GUIDANCE_KEY,
      confidence: 'high',
      explanation: 'You said you are not sure, which is a perfectly good answer.',
    });
  }

  return limitPerCategory(out);
}

/**
 * At most two of each kind, then the overall cap.
 *
 * Without this the list is an arbitrary subset: a long, rich description produces eleven
 * suggestions, the cap keeps eight, and the three that fall off the end are whatever came
 * last in vocabulary order. A person who wrote "I would rather speak Hindi" and did not see
 * a language suggested had been told something untrue about what was understood — and a
 * surplus line reporting "there was more" does not repair that, because the missing thing
 * was not a rounding detail.
 *
 * So diversity comes first and count second. Two areas of work is a real reading; six is a
 * restatement, and the sixth has a better chance of being something the person would have
 * rejected.
 */
function limitPerCategory(suggestions: readonly Suggestion[]): Suggestion[] {
  const perCategory = new Map<AiSignalCategory, number>();
  const out: Suggestion[] = [];

  // Strongest first within each kind, so the two that survive a kind are the two best
  // supported rather than the two the vocabulary happened to list first.
  const ranked = [...suggestions].sort((a, b) => b.strength - a.strength);

  for (const suggestion of ranked) {
    const seen = perCategory.get(suggestion.category) ?? 0;

    if (seen >= MAX_PER_CATEGORY) {
      continue;
    }

    perCategory.set(suggestion.category, seen + 1);
    out.push(suggestion);
  }

  // Back in vocabulary order within each kind, so two areas of work read the way the
  // questions would list them rather than by match length.
  return out.sort((a, b) =>
    a.category === b.category
      ? 0
      : CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
}

/**
 * The order kinds appear in, which is the order the intake asks about them.
 *
 * Worth pinning: the suggestions are shown in this order, and a person scanning eight of
 * them should meet them in the sequence the questions will ask for.
 */
const CATEGORY_ORDER: readonly AiSignalCategory[] = [
  'area',
  'communicationStyle',
  'context',
  'language',
  'sessionFormat',
  'availability',
  'guidance',
];

/**
 * What turns a match off.
 *
 * The brief's own example sentence is "I'd rather talk things through than be given
 * homework" — and a matcher that reads that as a preference for *Structured* has produced
 * the exact opposite of what was said, in front of the person who said it. That is the worst
 * failure this file can have, so the cue lookup refuses a match that is being rejected in the
 * sentence around it.
 *
 * ## The direction of the error is deliberate
 *
 * This is a keyword matcher, so a negation it cannot parse costs a *miss* — someone who
 * said "I feel better than before about work" may not get a work suggestion. A miss is
 * correctable: the suggestion list is shown for approval, and the intake questions are one
 * click away. A false positive puts a wrong answer in front of someone and calls it
 * something they said, and there is no way for them to tell that it did not.
 *
 * So when in doubt, skip. `than` is included even though it is sometimes a comparison rather
 * than a rejection, for exactly that reason.
 */
const NEGATED_BEFORE =
  /\b(?:not|never|instead of|rather than|than|do not|don't|dont|didn't|avoid|rather not)\b/;

/** How far back to look for a rejection. A clause, not a paragraph. */
const NEGATION_LOOKBACK = 24;

function cueFor(
  text: string,
  key: string,
  name: string,
  cues: Readonly<Record<string, readonly string[]>>,
): { strength: number; explicit: boolean } | null {
  const words = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 3);
  const phrases = cues[key] ?? [];

  // A phrase match is a person putting it in their own words. A bare word lifted from the
  // name is a weaker signal, and is reported at lower confidence so it can be rejected.
  // The strongest match wins, measured by how much of the vocabulary term it rests on.
  //
  // Without this the cap keeps whichever two came first in vocabulary order, which for a
  // description mentioning work, relocation, family and language means "career transitions"
  // and "family dynamics" survive while "work stress" and "adjustment to relocation" are
  // dropped. A bare cue is weak evidence; "overwhelmed" is strong; a longer phrase is
  // stronger still, because it is less likely to have been an accident.
  let best: { strength: number; explicit: boolean } | null = null;

  const consider = (candidates: readonly string[], explicit: boolean): void => {
    for (const candidate of candidates) {
      if (matchAt(text, candidate) === null) {
        continue;
      }

      const strength = candidate.length;

      if (best === null || strength > best.strength) {
        best = { strength, explicit };
      }
    }
  };

  consider(phrases, true);
  consider(words, false);

  return best;
}

/**
 * The first position `phrase` occurs at that is not immediately preceded by a rejection.
 *
 * Returns the position rather than a boolean so a later occurrence can still match: "I do
 * not want structure, but I do want warmth" has one rejected match for `structured` and a
 * live one for `warm`, and stopping at the first hit would have got that wrong.
 */
function matchAt(text: string, phrase: string): number | null {
  for (let index = text.indexOf(phrase); index !== -1; index = text.indexOf(phrase, index + 1)) {
    // Word boundaries on both sides, which is what stops "I moved to **German**y" reading as
    // a preference for German. That is not a hypothetical: it is what the first version of
    // this did, and it suggested a language to somebody who had named a country. A substring
    // match on a short cue is not a smaller risk than a wrong suggestion, it is the wrong
    // suggestion.
    const after = text.slice(index + phrase.length, index + phrase.length + 1);
    if (/[a-z]/.test(after)) {
      continue;
    }

    const before = text[index - 1] ?? ' ';
    if (/[a-z]/.test(before)) {
      continue;
    }

    const window = text.slice(Math.max(0, index - NEGATION_LOOKBACK), index);

    if (!NEGATED_BEFORE.test(window)) {
      return index;
    }
  }

  return null;
}

function describeWhen(part: TimeOfDay | null, days: readonly DayName[]): string {
  const dayText = days.length === 0 ? '' : prettyDays(days);
  const partText = part === null ? '' : prettyPart(part);

  if (dayText !== '' && partText !== '') {
    return `${dayText} ${partText.toLowerCase()}`;
  }

  return dayText !== '' ? dayText : partText;
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

function prettyPart(part: TimeOfDay): string {
  return part === 'morning' ? 'Mornings' : part === 'afternoon' ? 'Afternoons' : 'Evenings';
}

function lower(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * The case summary, assembled entirely from the structured context it was given.
 *
 * Every sentence is built from a field on `AiCaseContext` — a name, an evidence sentence,
 * a gap. There is no template that can mention a score, a rank, a candidate the server did
 * not put in the context, or an attribute nobody recorded. That is what makes an invented
 * reason structurally impossible here rather than merely discouraged; the real provider is
 * held to the same rule by `assertGroundedIn`, which is the only difference between them.
 */
function summarise(context: AiCaseContext): AiCaseSummary {
  const inCategory = (category: string): readonly string[] =>
    context.needs.filter((need) => need.category === category).map((need) => need.label);

  const areas = inCategory(NEED_CATEGORIES.areasOfWork);
  const styles = inCategory(NEED_CATEGORIES.communicationStyles);
  const contexts = inCategory(NEED_CATEGORIES.contextualExperiences);
  const languages = inCategory(NEED_CATEGORIES.languages);

  const sentences: string[] = [];

  sentences.push(
    areas.length === 0
      ? `They are looking for support around ${context.hasRequirements ? 'the things they have marked as important' : 'what they have described so far'}.`
      : `They are looking for support around ${list(areas)}${context.hasRequirements ? ', and have marked some of it as important' : ''}.`,
  );

  if (styles.length > 0) {
    sentences.push(`They asked for ${list(styles)} conversations.`);
  }

  if (languages.length > 0) {
    sentences.push(`They would rather speak ${list(languages)}.`);
  }

  if (contexts.length > 0) {
    sentences.push(`${list(contexts)} seems relevant to their situation.`);
  }

  const gaps = context.suggestion.notOffered;

  if (gaps.length === 0) {
    sentences.push(`${context.suggestion.name} matches everything that was asked for.`);
  } else {
    /*
     * One sentence per family, not one sentence listing all of them, and no family label.
     *
     * The first version read: "Arjun Sethi does not carry Career transitions, Relationships
     * or Work stress (work with)." Three separate gaps joined as though they were
     * alternatives to each other, with a storage-ish label tacked on the end. Both halves
     * were wrong: a matcher reading it has to work out whether one gap or three is meant,
     * and "work with" is a column name rather than a thing anyone says.
     *
     * The family is dropped because the case page beside this panel is grouped by family
     * already, and the terms are named individually. A summary that repeats the grouping adds
     * nothing a reader does not have, and costs a line of sentence.
     */
    for (const gap of gaps) {
      sentences.push(`${context.suggestion.name} does not offer ${joinOr(gap.names)}.`);
    }
  }

  const observations: string[] = [];
  const tradeoffs: string[] = [];

  for (const gap of gaps) {
    observations.push(
      `${joinOr(gap.names)} ${wasAskedFor(gap.names.length)} and ${context.suggestion.name} does not offer it.`,
    );

    // A tradeoff is only a tradeoff if someone covers the gap. Otherwise it is a
    // one-sided miss, and saying so as a tradeoff would imply a choice that is not there.
    const better = context.alternatives.find(
      (candidate) =>
        candidate.reasons.length > 0 &&
        !candidate.notOffered.some((entry) => entry.category === gap.category),
    );

    if (better !== undefined) {
      const cost = joinOr(better.notOffered.flatMap((entry) => entry.names));

      tradeoffs.push(
        `${better.name} covers ${lower(gap.category)} where ${context.suggestion.name} does not, and ${
          cost === '' ? 'misses nothing else that was asked for' : `misses ${cost}`
        }.`,
      );
    }
  }

  if (context.alternatives.length > 0) {
    observations.push(
      `${context.alternatives.length} other ${context.alternatives.length === 1 ? 'candidate' : 'candidates'} met everything marked as important.`,
    );
  }

  for (const step of context.priorFeedback) {
    // The reason names are sentences that already end in a full stop, so an unconditional one
    // here printed "…didn't feel right.." on a matcher's screen. Sentence-cased, then
    // punctuated once.
    observations.push(`In an earlier search they said: ${withFullStop(sentenceCase(step))}`);
  }

  if (observations.length === 0) {
    observations.push('Nothing stands out. The evidence alongside this is the whole of it.');
  }

  return {
    summary: sentences.join(' '),
    observations: observations.slice(0, 5),
    tradeoffs: tradeoffs.slice(0, 3),
  };
}

/** Ends in exactly one full stop, whatever it arrived with. */
function withFullStop(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Capitalises the first letter, for quoting a reason mid-sentence. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "was asked for" or "were asked for", from the count rather than from hope. */
function wasAskedFor(count: number): string {
  return count === 1 ? 'was asked for' : 'were asked for';
}

function list(items: readonly string[]): string {
  if (items.length === 1) {
    return items[0] ?? '';
  }

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

function joinOr(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0] ?? '';
  }

  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

/** Never thrown by the mock; exported so a swapped-in provider can reuse the same catch. */
export { AiUnavailableError };
