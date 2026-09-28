import type { AiCaseContext, AiCaseSummary } from './aiProvider.js';

/**
 * The check that makes "every claim is traceable to a field" mechanical.
 *
 * ## The problem
 *
 * `AiCaseContext` is deliberately narrow. There is no biography, no score, no rank, no free
 * text and no name for the client. A model given that can still go wrong: it can name
 * someone who is not in the case, invent an attribute nobody recorded, reach for a figure,
 * or slip into the clinical register the product refuses.
 *
 * The mock cannot do any of that, because it is a function of its input. A real model can do
 * all of it. So both providers' output passes through here before it is returned.
 *
 * ## What this does and does not check
 *
 * **It does check**, and these are the failures that matter here:
 *
 * 1. **A person or an attribute nobody recorded.** Every capitalised word in the output must
 *    be either ordinary English or something the case actually contains. "Priya Sharma" and
 *    "EMDR" are both absent from a case that never mentioned them, and both are refused.
 * 2. **A figure.** No digit appears that the case does not contain, and the figures the
 *    product refuses outright — a score, a rank, a percentage — are refused by phrase.
 * 3. **Forbidden register.** Clinical language, treatment advice, and verdicts such as
 *    "the best match" are refused by phrase.
 * 4. **Size.** A summary that ran on, or a list of forty observations, is trimmed before it
 *    is checked, so the check looks at what will actually be rendered.
 *
 * **It does not check** whether a sentence about someone who *is* in the case is a fair
 * characterisation of them. Nothing lexical can, and a check that claimed to would be
 * claiming more than it does. The controls that do that are upstream: the provider is given
 * no biography, no score and no free text, so there is nothing to mischaracterise. This
 * check is the backstop for what slips past the prompt, not a substitute for it.
 *
 * ## Why it errs towards refusal
 *
 * A refused summary produces a failed summary, the interface says so, and the deterministic
 * evidence a matcher came for is untouched. A summary that is quietly *almost* grounded is
 * the thing that cannot be detected afterwards, so the check is built to be the annoying one.
 */

/**
 * Ordinary English a summary needs, which the case itself does not contain.
 *
 * Two lists, and the split is deliberate.
 *
 * - `CONNECTIVES` are words that cannot assert a fact about anyone: *and, because, while,
 *   their*. A sentence without them is not English.
 * - `REPORTING` are the verbs and nouns a summary uses to talk *about* the case — *carry,
 *   covers, matches, asked for, worth comparing*. These are the words that made a
 *   word-for-word check refuse every usable summary, and each one still cannot invent a
 *   person, an attribute, or a number.
 *
 * Both lists are curated rather than generated, and that curation **is the limit of the
 * check**. A reporting word nobody thought of is refused. That is the intended direction:
 * a summary lost is a nuisance, a fabricated one is a person being misled about who they
 * would see.
 */
const CONNECTIVES = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'also',
  'although',
  'always',
  'am',
  'an',
  'and',
  'another',
  'any',
  'anyone',
  'anything',
  'are',
  'around',
  'as',
  'at',
  'away',
  'back',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'either',
  'else',
  'enough',
  'even',
  'ever',
  'every',
  'everyone',
  'everything',
  'except',
  'far',
  'few',
  'first',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'however',
  'i',
  'if',
  'in',
  'indeed',
  'instead',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'like',
  'little',
  'made',
  'make',
  'makes',
  'many',
  'may',
  'me',
  'might',
  'mine',
  'more',
  'most',
  'much',
  'must',
  'my',
  'myself',
  'near',
  'neither',
  'never',
  'next',
  'no',
  'nor',
  'not',
  'nothing',
  'now',
  'of',
  'off',
  'on',
  'once',
  'one',
  'only',
  'onto',
  'or',
  'other',
  'others',
  'our',
  'ours',
  'out',
  'over',
  'own',
  'per',
  'perhaps',
  'rather',
  'same',
  'see',
  'seem',
  'seems',
  'she',
  'should',
  'since',
  'so',
  'some',
  'someone',
  'something',
  'still',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'thing',
  'things',
  'this',
  'those',
  'though',
  'through',
  'to',
  'too',
  'toward',
  'towards',
  'under',
  'until',
  'up',
  'upon',
  'us',
  'very',
  'was',
  'way',
  'we',
  'well',
  'were',
  'what',
  'when',
  'where',
  'whether',
  'which',
  'while',
  'who',
  'whom',
  'whose',
  'why',
  'will',
  'with',
  'within',
  'without',
  'would',
  'yet',
  'you',
  'your',
  'yours',
]);

/** Words for talking about the case rather than describing anything new. */
const REPORTING = new Set([
  'align',
  'aligned',
  'aligns',
  'alignment',
  'ask',
  'asked',
  'asking',
  'asks',
  'attribute',
  'attributes',
  'balance',
  'balanced',
  'bring',
  'brings',
  'carry',
  'carried',
  'carries',
  'carry',
  'check',
  'choose',
  'chose',
  'chosen',
  'combines',
  'compare',
  'compared',
  'compares',
  'comparing',
  'comparison',
  'consider',
  'considered',
  'considering',
  'contrast',
  'covered',
  'covers',
  'cover',
  'described',
  'describes',
  'difference',
  'differences',
  'differ',
  'differs',
  'eligible',
  'evidence',
  'explicit',
  'explicitly',
  'fit',
  'fits',
  'focus',
  'focused',
  'give',
  'given',
  'gives',
  'gave',
  'help',
  'helps',
  'helpful',
  'important',
  'include',
  'includes',
  'including',
  'inspect',
  'inspects',
  'instead',
  'interesting',
  'lack',
  'lacks',
  'left',
  'looking',
  'looks',
  'made',
  'main',
  'mainly',
  'major',
  'mainly',
  'mark',
  'marked',
  'marks',
  'match',
  'matched',
  'matches',
  'matching',
  'matter',
  'matters',
  'may',
  'means',
  'meet',
  'meets',
  'mentioned',
  'mentions',
  'mismatch',
  'missing',
  'misses',
  'miss',
  'need',
  'needed',
  'needs',
  'negotiate',
  'note',
  'noted',
  'notes',
  'offer',
  'offered',
  'offers',
  'offering',
  'order',
  'ordered',
  'partly',
  'per',
  'point',
  'points',
  'possibility',
  'possible',
  'prefer',
  'preference',
  'preferences',
  'preferred',
  'preferring',
  'presents',
  'priority',
  'question',
  'questions',
  'reaches',
  'read',
  'reading',
  'reasonably',
  'recorded',
  'regarding',
  'relates',
  'relevant',
  'relies',
  'remain',
  'remains',
  'requested',
  'require',
  'required',
  'requires',
  'review',
  'reviewing',
  'reviews',
  'say',
  'said',
  'says',
  'see',
  'seen',
  'set',
  'settle',
  'shows',
  'situated',
  'speak',
  'speaks',
  'spoken',
  'stand',
  'stands',
  'strong',
  'strongly',
  'suggests',
  'summary',
  'support',
  'supports',
  'supported',
  'sustain',
  'sustains',
  'talk',
  'talks',
  'thing',
  'things',
  'think',
  'thought',
  'told',
  'tradeoff',
  'tradeoffs',
  'turn',
  'turns',
  'unmet',
  'useful',
  'value',
  'values',
  'want',
  'wanted',
  'wants',
  'weak',
  'whether',
  'willing',
  'worth',
  'work',
  'works',
  'working',
  'worthwhile',
  // Plurals the case states in the singular, and the abstract nouns a summary needs to talk
  // about *the asking* rather than about the asking. A stem function that handled
  // "-ations" would catch most of these, but not "conversations", which is a lexical
  // plural the case never has to use.
  'conversations',
  'conversation',
  'circumstances',
  'situation',
  'situations',
  'session',
  'sessions',
  'requirement',
  'requirements',
  'constraint',
  'constraints',
  'preference',
  'trade',
  'detail',
  'details',
  'history',
  'background',
  'focus',
  'areas',
  'area',
  'languages',
  'formats',
  'styles',
  'approaches',
  'experiences',
  'availability',
  'guidance',
  'candidate',
  'candidates',
  'evidence',
  'explanation',
  'explanations',
  'reason',
  'reasons',
  'summary',
  'overview',
  'picture',
  'sense',
  'angle',
  'angles',
  'strength',
  'strengths',
  'weakness',
  'weaknesses',
  'gap',
  'gaps',
  'differences',
  'similarities',
  'overlap',
  'priority',
  'priorities',
  'discrepancy',
  'discrepancies',
  'mismatch',
  'mismatches',
  // What a summary says about the *shape* of the case rather than about a person: how many
  // candidates there were, what happened on a previous pass. Without these, a statement that
  // is true of the case — "one other candidate met everything marked as important" — is
  // refused for using a word the context happens not to contain. A check that cannot tell a
  // true statement from a fabricated one is not a check.
  'met',
  'meets',
  'search',
  'pass',
  'earlier',
  'previously',
  'before',
  'time',
  'other',
  'others',
  'another',
  'eligible',
  'considered',
  'shortlist',
  'everything',
  'marked',
  'several',
  'few',
]);

/**
 * Register the product refuses, checked by phrase.
 *
 * Separated from the word checks because these are the failures where a *correct* vocabulary
 * word in the wrong company still changes what a reader believes. "condition" is harmless
 * alone and alarming beside "shows symptoms of".
 */
const REFUSED_PHRASES: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /\b(diagnos\w*|disorder|ptsd|bipolar|psychosis|psychotic|has depression|have anxiety|symptom\w* of)\b/i,
    reason: 'clinical language',
  },
  {
    pattern:
      /\b(medication|prescrib\w*|a dose|therapy plan|therapeutic intervention|treatment plan|homework to complete)\b/i,
    reason: 'treatment advice',
  },
  {
    pattern:
      /\b\d{1,3}\s?%|\bscore[ds]?\b|\brank(ed|ing)?\b|\b\d+\s*\/\s*\d+\b|\bweighted\b|\bout of \d+\b/i,
    reason: 'a figure or rank',
  },
  {
    pattern:
      /\b(best|top|perfect|ideal|guarantee\w*|optimal|strongest match|will (?:definitely|certainly) (?:suit|work))\b/i,
    reason: 'a verdict',
  },
  {
    pattern:
      /\b(?:most|highly|extremely|exceptionally) (?:experienced|qualified|skilled|suited)\b/i,
    reason: 'a claim about a person the evidence does not carry',
  },
  {
    pattern:
      /\b(certainly|obviously|clearly|definitely) (?:is|are) (?:the right|the best|the one)\b/i,
    reason: 'a verdict',
  },
];

export type GroundingResult =
  | { readonly ok: true; readonly summary: AiCaseSummary }
  | { readonly ok: false; readonly reason: string };

/** Long enough for the two or three sentences asked for, and no more. */
export const MAX_SUMMARY_LENGTH = 900;

/** Caps. A list of everything is not a summary, and an unbounded list is a denial of service. */
export const MAX_OBSERVATIONS = 5;
export const MAX_TRADEOFFS = 3;
export const MAX_ITEM_LENGTH = 220;

/**
 * Trim, de-duplicate and cap a model-supplied list.
 *
 * Runs before the grounding check so the check looks at what will actually be rendered
 * rather than at text a cap later removed.
 */
export function normaliseSummary(raw: AiCaseSummary): AiCaseSummary {
  const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

  const unique = (values: readonly string[]): readonly string[] => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const value of values) {
      const text = clean(value);

      if (text === '' || seen.has(text.toLowerCase())) {
        continue;
      }

      seen.add(text.toLowerCase());
      out.push(text.slice(0, MAX_ITEM_LENGTH));
    }

    return out;
  };

  return {
    summary: clean(raw.summary).slice(0, MAX_SUMMARY_LENGTH),
    observations: unique(raw.observations).slice(0, MAX_OBSERVATIONS),
    tradeoffs: unique(raw.tradeoffs).slice(0, MAX_TRADEOFFS),
  };
}

/** Every word, lowercased, with punctuation stripped and no stemming. */
function words(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

/** Reduce a word to a stem crude enough to be safe and careful enough to be useful. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** The stem set of the case: every word it contains, and nothing else. */
function caseWords(context: AiCaseContext): ReadonlySet<string> {
  const set = new Set<string>();

  const add = (text: string): void => {
    for (const word of words(text)) {
      set.add(stem(word));
      set.add(word);
    }
  };

  for (const need of context.needs) {
    add(need.category);
    add(need.label);
  }

  const addCandidate = (candidate: AiCaseContext['suggestion']): void => {
    add(candidate.name);

    for (const reason of candidate.reasons) {
      add(reason);
    }

    for (const gap of candidate.notOffered) {
      add(gap.category);
      gap.names.forEach(add);
    }
  };

  addCandidate(context.suggestion);
  context.alternatives.forEach(addCandidate);
  context.priorFeedback.forEach(add);

  /*
   * The candidate count, as words the context does not otherwise contain.
   *
   * A number is only acceptable if the case justifies it, and this is how a *true* count is
   * justified: the case holds this many alternatives, so "one other candidate" is a fact
   * about the case rather than a figure a provider produced. Without it, a summary that
   * reports the real number is refused while one that invents a different number is also
   * refused, and the check cannot tell the two apart.
   */
  const alternatives = context.alternatives.length;
  for (const count of [alternatives, 0, 1]) {
    add(COUNT_WORDS[count] ?? String(count));
    // The numeral as well as the word. A summary may write "2 other candidates" or "two
    // other candidates", and both are the same true statement; the digit branch below
    // looks the token up verbatim, so `2` has to be in the set for `2` to be accepted.
    add(String(count));
  }

  return set;
}

/**
 * How a small number is written in a sentence.
 *
 * Only as far as a shortlist would go. Beyond that a summary should say "several", which is
 * in `REPORTING` and needs no number.
 */
const COUNT_WORDS: Readonly<Record<number, string>> = {
  0: 'no',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
};

/** A capitalised word, whether or not it starts a sentence. */
function isCapitalised(token: string): boolean {
  return /^[A-Z]/.test(token) && !/^[A-Z]+\d/.test(token);
}

/**
 * Check a summary against the case it describes.
 *
 * Returns the normalised summary when it holds up, and a reason when it does not. The
 * reason is written for a log, not for a browser: the interface gets a sentence saying the
 * summary could not be trusted, because "the assistant mentioned something we could not
 * find in the data" is the least useful thing to tell someone waiting on a page.
 */
export function assertGroundedIn(raw: AiCaseSummary, context: AiCaseContext): GroundingResult {
  const summary = normaliseSummary(raw);

  if (summary.summary === '') {
    return { ok: false, reason: 'the summary was empty' };
  }

  if (summary.observations.length === 0) {
    return { ok: false, reason: 'no observations survived normalisation' };
  }

  const prose = [summary.summary, ...summary.observations, ...summary.tradeoffs].join(' \n ');

  for (const refusal of REFUSED_PHRASES) {
    if (refusal.pattern.test(prose)) {
      return { ok: false, reason: `the summary used ${refusal.reason}` };
    }
  }

  const caseVocabulary = caseWords(context);
  const unknownNames: string[] = [];
  const unknownClaims: string[] = [];

  // Tokenised on whitespace and stripped of punctuation, so a word is compared without the
  // comma or full stop it arrived wearing. An earlier version tracked each token's position
  // as well, to distinguish a sentence-initial capital from one mid-sentence; that turned out
  // to be unnecessary, because the connective and vocabulary lists are matched
  // case-insensitively and a sentence-initial name is in the case anyway.
  const tokens = prose.split(/\s+/).filter((token) => token !== '');

  for (const raw of tokens) {
    const token = raw.replace(/[^A-Za-z0-9-]/g, '');

    if (token === '') {
      continue;
    }

    const bare = token.toLowerCase();

    // A digit. Any digit at all, unless the case contains that number. A matcher has no way
    // to check a figure, so a figure that is not traceable is a figure that should not be
    // on the page.
    if (/\d/.test(token)) {
      if (!caseVocabulary.has(bare)) {
        unknownClaims.push(`figure ${token}`);
      }
      continue;
    }

    if (CONNECTIVES.has(bare) || REPORTING.has(bare) || caseVocabulary.has(stem(bare))) {
      continue;
    }

    // A capitalised word that is neither ordinary English nor in the case. This is the
    // check that catches a name the case never mentioned, and an attribute — "EMDR", "CBT",
    // "PTSD" — that is not in anyone's stored evidence.
    if (isCapitalised(token)) {
      unknownNames.push(token);
      continue;
    }

    // A lower-case content word nobody accounted for. Refused, because the alternative is a
    // claim nobody can trace.
    unknownClaims.push(bare);
  }

  if (unknownNames.length > 0) {
    return {
      ok: false,
      reason: `the summary named things absent from the case: ${[...new Set(unknownNames)].sort().join(', ')}`,
    };
  }

  if (unknownClaims.length > 0) {
    return {
      ok: false,
      reason: `the summary used terms absent from the case: ${[...new Set(unknownClaims)].sort().join(', ')}`,
    };
  }

  return { ok: true, summary };
}
