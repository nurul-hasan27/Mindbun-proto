import { describe, expect, it, vi } from 'vitest';
import { createMockAiProvider } from './mockAiProvider.js';
import {
  CATEGORY_FAMILY,
  MAX_EXPLANATION_LENGTH,
  MAX_SIGNALS,
  OPEN_TO_GUIDANCE_KEY,
  collapseToText,
  formatAvailabilityHint,
  parseAvailabilityHint,
  resolveTarget,
  validateSignals,
  type IntakeVocabularyView,
} from './signalVocabulary.js';
import { AiUnavailableError } from './aiProvider.js';

/**
 * The vocabulary, shaped from what the seed actually contains.
 *
 * Real keys and real names rather than a convenient pair, because the mock reads the *names*
 * and the validator reads the *keys*. A fixture invented for the test would let a bug in
 * either survive — the mock matching a name that does not exist, or the validator accepting
 * a key that does not.
 */
const VOCABULARY: IntakeVocabularyView = {
  areasOfWork: [
    { key: 'career-transitions', name: 'Career transitions' },
    { key: 'family-dynamics', name: 'Family dynamics' },
    { key: 'grief-and-loss', name: 'Grief and loss' },
    { key: 'self-worth', name: 'Self-worth' },
    { key: 'work-stress', name: 'Work stress' },
  ],
  communicationStyles: [
    { key: 'direct', name: 'Direct' },
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
    { key: 'warm', name: 'Warm' },
  ],
  contextualExperience: [
    { key: 'family-expectations', name: 'Family expectations' },
    { key: 'indian-diaspora', name: 'Indian diaspora' },
    { key: 'relocation', name: 'Relocation' },
  ],
  languages: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'de', name: 'German' },
  ],
  sessionFormats: [
    { key: 'in-person', name: 'In person' },
    { key: 'online', name: 'Online' },
  ],
};

const readVocabulary = (): Promise<IntakeVocabularyView> => Promise.resolve(VOCABULARY);
const provider = createMockAiProvider(readVocabulary);

const KEYS_OF = (signals: readonly { key: string }[]): readonly string[] =>
  signals.map((s) => s.key);

describe('the mock provider, as a conversation', () => {
  it('greets before anyone has said anything, and explains the rules only there', async () => {
    const turn = await provider.nextTurn([{ role: 'assistant', text: 'unused' }], {});

    expect(turn.reply).toMatch(/your own words/i);
    expect(turn.readyToSummarise).toBe(false);
  });

  it('asks a question rather than pretending to understand nothing', async () => {
    const turn = await provider.nextTurn(
      [{ role: 'user', text: 'The situation has been difficult.' }],
      {},
    );

    // "Difficult" matches no vocabulary term. The honest reply is a question, not a summary
    // of three weak guesses.
    expect(turn.reply).toMatch(/\?/);
    expect(turn.readyToSummarise).toBe(false);
  });

  it('asks about a family the intake has not answered yet', async () => {
    const turn = await provider.nextTurn(
      [{ role: 'user', text: 'Work has been stressful and I would rather talk things through.' }],
      { areasOfWork: ['work-stress'] },
    );

    // The area is answered, so it must not be asked about. The style is not, so it is the
    // next question — and the mock is deterministic about which.
    expect(turn.reply).toMatch(/explore|practical/i);
  });

  it('stops asking once the intake holds an answer for every family', async () => {
    const turn = await provider.nextTurn(
      [{ role: 'user', text: 'Work has been stressful and I would rather talk things through.' }],
      {
        areasOfWork: ['work-stress'],
        communicationStyles: ['exploratory'],
        contextualExperience: ['family-expectations'],
        languages: ['en'],
        sessionFormats: ['online'],
      },
    );

    expect(turn.readyToSummarise).toBe(true);
    expect(turn.reply).toMatch(/understood/i);
  });

  it('is deterministic: the same transcript always produces the same reply', async () => {
    const messages = [
      { role: 'user' as const, text: 'I moved to Germany and feel like an outsider.' },
    ];

    const first = await provider.nextTurn(messages, {});
    const second = await provider.nextTurn(messages, {});

    expect(first).toEqual(second);
  });
});

describe('the mock provider, as an interpreter', () => {
  it('reads a plain description of work and preference into real vocabulary keys', async () => {
    const signals = await provider.extractSignals([
      {
        role: 'user',
        text: "I've been overwhelmed at work lately and I'd rather talk things through.",
      },
    ]);

    expect(KEYS_OF(signals)).toEqual(expect.arrayContaining(['work-stress', 'exploratory']));
  });

  it('reads a relocation and a family expectation as context, not as a topic', async () => {
    const signals = await provider.extractSignals([
      {
        role: 'user',
        text: "I moved to Germany a few years ago and my parents keep asking when I'm going to settle down.",
      },
    ]);

    const context = signals.filter((signal) => signal.category === 'context');
    expect(KEYS_OF(context)).toEqual(expect.arrayContaining(['relocation', 'family-expectations']));
  });

  it('reads a preference stated in the person’s own words as high confidence', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'I would rather talk it through than be given a plan.' },
    ]);

    const exploratory = signals.find((signal) => signal.key === 'exploratory');
    expect(exploratory?.confidence).toBe('high');
  });

  it('does not suggest the thing a person said they would rather not have', async () => {
    // The brief's own example. "Homework" is a cue for Structured, so without a negation
    // check this returns the opposite of what was said, in front of the person who said it.
    const signals = await provider.extractSignals([
      {
        role: 'user',
        text: "I've been overwhelmed at work lately and I'd rather talk things through than be given homework.",
      },
    ]);

    expect(KEYS_OF(signals)).toContain('exploratory');
    expect(KEYS_OF(signals)).not.toContain('structured');
  });

  it('still matches a preference that is mentioned alongside a rejection of another', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'I do not want a structured plan, but I would like it warm.' },
    ]);

    expect(KEYS_OF(signals)).toContain('warm');
    expect(KEYS_OF(signals)).not.toContain('structured');
  });

  it('does not read a country as a language', async () => {
    // A substring match on a short cue is not a smaller risk than a wrong suggestion, it is
    // the wrong suggestion. The first version of the mock did exactly this, and the live API
    // was asked to confirm it: "I moved to Germany" came back with
    // "You would rather speak German."
    const signals = await provider.extractSignals([
      { role: 'user', text: 'I moved to Germany a few years ago.' },
    ]);

    const languages = signals.filter((signal) => signal.category === 'language');
    expect(languages).toEqual([]);

    // And the relocation is still read, because it is there in the sentence.
    expect(KEYS_OF(signals)).toContain('relocation');
  });

  it('still reads a language when the language is actually named', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'I moved to Germany but I would rather speak German with someone.' },
    ]);

    expect(KEYS_OF(signals.filter((signal) => signal.category === 'language'))).toEqual(['de']);
  });

  it('reads a language as that language’s code, not as a word it invented', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'I would rather talk in Hindi, please.' },
    ]);

    const language = signals.find((signal) => signal.category === 'language');
    expect(language?.key).toBe('hi');
  });

  it('offers a time as a hint, never as a day the person did not give', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'I am usually free on Tuesday and Wednesday evenings.' },
    ]);

    const hint = signals.find((signal) => signal.category === 'availability');
    expect(hint?.confidence).toBe('low');
    expect(parseAvailabilityHint(hint?.key ?? '')).toEqual({
      part: 'evening',
      days: ['TUESDAY', 'WEDNESDAY'],
    });
  });

  it('treats "I do not know" as a real answer the intake has a key for', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: "Honestly I don't know what kind of therapy I need." },
    ]);

    expect(KEYS_OF(signals)).toContain(OPEN_TO_GUIDANCE_KEY);
  });

  it('keeps two of each kind, so one kind cannot crowd out the rest', async () => {
    // A rich description produces eleven suggestions and the cap is eight, so without a
    // per-category limit the three that fall off the end are whatever came last in vocabulary
    // order. A person who wrote "I would rather speak Hindi" and saw no language suggested
    // had been told something untrue about what was understood — and a surplus line saying
    // "there was more" does not repair it, because the missing thing was not a rounding
    // detail. It was the only thing said about a language.
    const signals = await provider.extractSignals([
      {
        role: 'user',
        text: "I've been overwhelmed at work lately. I moved to Germany a few years ago and I think part of what I'm struggling with is balancing what my family expects from me with what I actually want. I'd rather talk things through than be given homework. I am usually free on Tuesday and Wednesday evenings and I would rather speak Hindi.",
      },
    ]);

    const perCategory = new Map<string, number>();
    for (const signal of signals) {
      perCategory.set(signal.category, (perCategory.get(signal.category) ?? 0) + 1);
    }

    for (const [category, count] of perCategory) {
      expect(count, `${category} should be capped at two`).toBeLessThanOrEqual(2);
    }

    // And the kinds that were mentioned are all represented, which is the actual point.
    expect(KEYS_OF(signals)).toEqual(
      expect.arrayContaining(['work-stress', 'exploratory', 'relocation', 'hi']),
    );
  });

  it('keeps the two best-supported of a kind, not the two the vocabulary lists first', async () => {
    // The same description, and the specific case that the per-category cap had to be paired
    // with. "work" (career transitions) and "family" (family dynamics) come earlier in the
    // seed than "overwhelmed" (work stress) and "moved to" (relocation), so a cap that kept
    // the first two would keep the weaker readings of both kinds.
    const signals = await provider.extractSignals([
      {
        role: 'user',
        text: "I've been overwhelmed at work lately. I moved to Germany a few years ago and I think part of what I'm struggling with is balancing what my family expects from me with what I actually want. I'd rather talk things through than be given homework. I am usually free on Tuesday and Wednesday evenings and I would rather speak Hindi.",
      },
    ]);

    const areas = signals.filter((signal) => signal.category === 'area');
    const contexts = signals.filter((signal) => signal.category === 'context');

    // Three areas match: "overwhelmed" for work stress, and the bare "work" and "family" for
    // the two that come earlier in the vocabulary. The cap keeps two, and the two it keeps
    // are decided by how much of what was said each rests on — so the eleven-character cue
    // beats the four-character one, and work stress survives alongside family dynamics.
    //
    // Career transitions is the loser, and it is the *first* of the three in vocabulary
    // order. A cap that kept the first two would have kept it and dropped work stress,
    // which is the specific mistake this test exists to catch.
    expect(areas.map((signal) => signal.key)).toEqual(['work-stress', 'family-dynamics']);
    expect(areas).toHaveLength(2);
    expect(signals.map((signal) => signal.key)).not.toContain('career-transitions');
    expect(contexts).toHaveLength(2);
  });

  it('never prints two full stops in a row, whatever it is quoting', async () => {
    // The seeded reason names already end in one. Found by looking at the rendered case page,
    // not by a test: the grounding check could not have caught it, because a second full stop
    // is punctuation rather than a claim.
    const context = {
      needs: [{ category: 'Work with', label: 'Work stress' }],
      hasRequirements: false,
      suggestion: { name: 'Ananya Rao', reasons: ['They speak Hindi.'], notOffered: [] },
      alternatives: [],
      priorFeedback: ["The communication style didn't feel right."],
    } as unknown as Parameters<typeof provider.summariseCase>[0];

    const summary = await provider.summariseCase(context);

    for (const line of [summary.summary, ...summary.observations, ...summary.tradeoffs]) {
      expect(line).not.toMatch(/\.\./);
    }
  });

  it('lists kinds in the order the questions ask about them', async () => {
    const signals = await provider.extractSignals([
      {
        role: 'user',
        text: "I've been overwhelmed at work. I moved to Germany and my family expects a lot. I would rather talk things through. Evenings suit me and I would rather speak Hindi.",
      },
    ]);

    const order = [
      'area',
      'communicationStyle',
      'context',
      'language',
      'sessionFormat',
      'availability',
      'guidance',
    ];
    const positions = [...new Set(signals.map((signal) => order.indexOf(signal.category)))];

    // Someone scanning eight suggestions should meet them in the sequence the questions will
    // ask for, rather than by match length.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('returns an empty list rather than a guess when nothing matches', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'The situation has been difficult.' },
    ]);

    expect(signals).toEqual([]);
  });

  it('attributes every suggestion to what the person said', async () => {
    const signals = await provider.extractSignals([
      { role: 'user', text: 'Work has been stressful.' },
    ]);

    expect(signals.every((signal) => signal.source === 'user_message')).toBe(true);
  });
});

describe('suggestion targets', () => {
  it('writes each category to the draft field that asks for it', () => {
    expect(resolveTarget({ category: 'area', key: 'work-stress' }, VOCABULARY)).toEqual({
      kind: 'draft',
      field: 'areasOfWork',
      label: 'Work stress',
    });

    // The one that is easy to get wrong: the vocabulary endpoint says
    // `contextualExperience`, the draft says `contextualExperiences`.
    expect(resolveTarget({ category: 'context', key: 'relocation' }, VOCABULARY)).toEqual({
      kind: 'draft',
      field: 'contextualExperiences',
      label: 'Relocation',
    });
  });

  it('treats a named approach as the same answer as a named conversation style', () => {
    const asApproach = resolveTarget({ category: 'approach', key: 'exploratory' }, VOCABULARY);
    const asStyle = resolveTarget(
      { category: 'communicationStyle', key: 'exploratory' },
      VOCABULARY,
    );

    expect(asApproach).toEqual(asStyle);
    expect(CATEGORY_FAMILY.approach).toBe(CATEGORY_FAMILY.communicationStyle);
  });

  it('refuses a key that is not in the vocabulary', () => {
    expect(resolveTarget({ category: 'area', key: 'made-up' }, VOCABULARY)).toBeNull();
  });

  it('refuses any guidance key but the one the intake has', () => {
    expect(resolveTarget({ category: 'guidance', key: 'anything-else' }, VOCABULARY)).toBeNull();
  });

  it('reads a time hint back into parts, and writes it in one canonical form', () => {
    const hint = { part: 'evening' as const, days: ['MONDAY' as const, 'FRIDAY' as const] };

    expect(parseAvailabilityHint(formatAvailabilityHint(hint))).toEqual(hint);
  });

  it('refuses a hint that has smuggled text into the key', () => {
    expect(parseAvailabilityHint('hint:evening:please just book me anything')).toBeNull();
    expect(parseAvailabilityHint('hint:midnight:MONDAY')).toBeNull();
    expect(parseAvailabilityHint('evening')).toBeNull();
  });

  it('describes a time hint in the product’s own wording', () => {
    const target = resolveTarget(
      { category: 'availability', key: 'hint:evening:MONDAY-TUESDAY' },
      VOCABULARY,
    );

    expect(target).toMatchObject({
      kind: 'availabilityHint',
      part: 'evening',
      days: ['MONDAY', 'TUESDAY'],
    });
    expect(target).toMatchObject({ label: 'Mondays, Tuesdays evenings' });
  });
});

describe('validateSignals', () => {
  const good = {
    category: 'area',
    key: 'work-stress',
    confidence: 'high' as const,
    source: 'user_message' as const,
    explanation: 'You mentioned work.',
  };

  it('keeps a signal whose key is real, and says where it lands', () => {
    const result = validateSignals([good], VOCABULARY);

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.target).toEqual({
      kind: 'draft',
      field: 'areasOfWork',
      label: 'Work stress',
    });
    expect(result.notUnderstood).toEqual([]);
  });

  it('drops an invented key and reports it rather than swallowing it', () => {
    const result = validateSignals(
      [{ ...good, key: 'cbt-for-anxiety', category: 'approach' }],
      VOCABULARY,
    );

    // Not "integrative"-style rejection: a key that is not in the vocabulary at all.
    expect(result.signals).toEqual([]);
    expect(result.notUnderstood).toEqual([{ category: 'approach', key: 'cbt-for-anxiety' }]);
  });

  it('never fuzzy-matches a near miss onto a real key', () => {
    const result = validateSignals([{ ...good, key: 'work-stres' }], VOCABULARY);

    // "work-stres" is one character from real. It is still not real, and a wrong suggestion
    // a person cannot see is worse than no suggestion at all.
    expect(result.signals).toEqual([]);
  });

  it('refuses a source that is not what the person said', () => {
    const result = validateSignals([{ ...good, source: 'model_prior' }], VOCABULARY);

    expect(result.signals).toEqual([]);
  });

  it('refuses a confidence that is not one of the three', () => {
    expect(validateSignals([{ ...good, confidence: 'certain' }], VOCABULARY).signals).toEqual([]);
  });

  it('refuses an unknown category', () => {
    expect(validateSignals([{ ...good, category: 'diagnosis' }], VOCABULARY).signals).toEqual([]);
  });

  it('survives a provider returning something that is not a list of objects', () => {
    for (const junk of [null, 'a string', 42, { signals: [] }, [null], ['text'], [42]]) {
      const result = validateSignals(junk, VOCABULARY);
      expect(result.signals).toEqual([]);
      expect(result.notUnderstood).toEqual([]);
      expect(result.surplus).toEqual([]);
    }
  });

  it('keeps the first of two identical suggestions and drops the rest', () => {
    const result = validateSignals([good, { ...good, explanation: 'Different text.' }], VOCABULARY);

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.explanation).toBe('You mentioned work.');
  });

  it('caps how many suggestions are shown', () => {
    // Real keys, because a cap proved with invented ones would pass whether or not the
    // validator rejected anything: an empty result truncated to eight is still zero.
    const big: IntakeVocabularyView = {
      areasOfWork: Array.from({ length: 30 }, (_unused, index) => ({
        key: `area-${index}`,
        name: `Area ${index}`,
      })),
      communicationStyles: VOCABULARY.communicationStyles,
      contextualExperience: VOCABULARY.contextualExperience,
      languages: VOCABULARY.languages,
      sessionFormats: VOCABULARY.sessionFormats,
    };

    const many = Array.from({ length: 30 }, (_unused, index) => ({
      ...good,
      key: `area-${index}`,
    }));

    const result = validateSignals(many, big);
    expect(result.signals).toHaveLength(MAX_SIGNALS);
  });

  it('reports the surplus rather than hiding it', () => {
    const big: IntakeVocabularyView = {
      areasOfWork: Array.from({ length: 12 }, (_unused, index) => ({
        key: `area-${index}`,
        name: `Area ${index}`,
      })),
      communicationStyles: VOCABULARY.communicationStyles,
      contextualExperience: VOCABULARY.contextualExperience,
      languages: VOCABULARY.languages,
      sessionFormats: VOCABULARY.sessionFormats,
    };

    const many = Array.from({ length: 12 }, (_unused, index) => ({
      ...good,
      key: `area-${index}`,
    }));

    const result = validateSignals(many, big);

    // Kept eight, reported four, and claimed neither to be "not understood" nor to be all
    // of it. The interface reads both lists rather than showing a list silently cut short.
    expect(result.signals).toHaveLength(MAX_SIGNALS);
    expect(result.surplus).toHaveLength(4);
    expect(result.notUnderstood).toEqual([]);
  });

  it('truncates a long explanation rather than dropping a correct suggestion', () => {
    const result = validateSignals([{ ...good, explanation: 'x'.repeat(900) }], VOCABULARY);

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.explanation).toHaveLength(MAX_EXPLANATION_LENGTH);
  });

  it('strips markup out of an explanation', () => {
    const result = validateSignals(
      [{ ...good, explanation: '<img src=x onerror=alert(1)>You mentioned <b>work</b>.' }],
      VOCABULARY,
    );

    const explanation = result.signals[0]?.explanation ?? '';
    expect(explanation).not.toContain('<');
    expect(explanation).not.toContain('>');
    expect(explanation).toContain('work');
  });

  it('collapses whitespace and leaves no closing tag behind', () => {
    expect(collapseToText('  a <b>b</b>   c <script>x</script> d  ')).toBe('a b c x d');
  });
});

describe('the provider contract', () => {
  it('is available and names itself, because a person can be told which one answered', () => {
    expect(provider.available).toBe(true);
    expect(provider.name).toBe('mock');
  });

  it('rejects with AiUnavailableError and nothing else, so one catch is enough', async () => {
    const turn = await provider.nextTurn([{ role: 'user', text: 'hello' }], {});

    expect(typeof turn.reply).toBe('string');
    expect(turn.reply.length).toBeGreaterThan(0);

    // The error type exists and carries a reason rather than a provider body, which is what
    // the route logs. Asserted here so a future edit cannot widen what it carries.
    const error = new AiUnavailableError('timeout');
    expect(error.message).toBe('The assistant is not available right now.');
    expect(error.message).not.toContain('timeout');
  });

  it('reads the vocabulary when asked, not when built', async () => {
    const read = vi.fn(readVocabulary);
    const lazy = createMockAiProvider(read);

    expect(read).not.toHaveBeenCalled();

    await lazy.extractSignals([{ role: 'user', text: 'work has been stressful' }]);
    expect(read).toHaveBeenCalledOnce();
  });

  it('picks up a term that was renamed in the database, with no restart', async () => {
    // The same provider, a vocabulary where "Work stress" has become "Workload".
    let vocabulary = VOCABULARY;
    const live = createMockAiProvider(() => Promise.resolve(vocabulary));

    const before = await live.extractSignals([{ role: 'user', text: 'work has been stressful' }]);
    expect(KEYS_OF(before)).toContain('work-stress');

    vocabulary = {
      ...VOCABULARY,
      areasOfWork: VOCABULARY.areasOfWork.map((area) =>
        area.key === 'work-stress' ? { key: 'workload', name: 'Workload' } : area,
      ),
    };

    const after = await live.extractSignals([{ role: 'user', text: 'work has been stressful' }]);
    const result = validateSignals(after, vocabulary);

    // The old key no longer exists, so it is rejected rather than silently kept.
    expect(KEYS_OF(result.signals)).not.toContain('work-stress');
  });
});
