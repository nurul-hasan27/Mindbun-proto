import { describe, expect, it } from 'vitest';
import {
  answerChoices,
  answer,
  answerDay,
  answerTimeOfDay,
  draftHasAnswer,
  isDraftEmptyFor,
  keysOf,
  UNSURE,
} from './answering';
import { emptyDraft, setSessionFormats, toggleArea } from './draft';
import { labelForKey, questionOrder, questions, LANGUAGE_SHORTLIST_SIZE } from './questions';
import type { IntakeVocabulary } from '../api/types';

const VOCABULARY: IntakeVocabulary = {
  areasOfWork: [
    { key: 'relationships', name: 'Relationships' },
    { key: 'career-transitions', name: 'Career transitions' },
    { key: 'family-dynamics', name: 'Family dynamics' },
    { key: 'life-transitions', name: 'Life transitions' },
    { key: 'burnout', name: 'Burnout' },
  ],
  communicationStyles: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
    { key: 'reflective', name: 'Reflective' },
    { key: 'solution-focused', name: 'Solution-focused' },
  ],
  contextualExperience: [
    { key: 'indian-diaspora', name: 'Indian diaspora' },
    { key: 'cross-cultural-relationships', name: 'Cross-cultural relationships' },
    { key: 'relocation', name: 'Relocation' },
    { key: 'international-students', name: 'International students' },
    { key: 'third-culture-upbringing', name: 'Third culture upbringing' },
  ],
  languages: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'bn', name: 'Bengali' },
    { code: 'ta', name: 'Tamil' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'ur', name: 'Urdu' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'fr', name: 'French' },
  ],
  sessionFormats: [
    { key: 'online', name: 'Online' },
    { key: 'in-person', name: 'In person' },
  ],
};

function choice(id: Parameters<typeof answerChoices>[0], label: string) {
  const found = answerChoices(id, VOCABULARY).find((entry) => entry.label === label);

  if (found === undefined) {
    throw new Error(`No choice labelled "${label}" on ${id}`);
  }

  return found;
}

describe('the shape of the flow', () => {
  it('asks the questions the product set out to ask, in order', () => {
    expect(questionOrder).toEqual([
      'support',
      'conversation',
      'context',
      'language',
      'sessions',
      'availability',
      'anything-else',
    ]);
  });

  it('gives every question a title and marks the optional ones as optional', () => {
    for (const question of questions) {
      expect(question.title.length).toBeGreaterThan(10);
      expect(question.explanation).toBeDefined();
    }

    const optional = questions.filter((question) => !question.required).map((q) => q.id);
    expect(optional).toEqual(['context', 'availability', 'anything-else']);
  });

  it('never uses clinical language in a question', () => {
    const all = questions.map((question) => `${question.title} ${question.explanation}`).join(' ');

    for (const word of [
      /\bdiagnos/i,
      /\bsymptom/i,
      /\bdisorder\b/i,
      /\bdisorder/i,
      /\bpatient\b/i,
      /\bclinical\b/i,
    ]) {
      expect(all, word.source).not.toMatch(word);
    }
  });
});

describe('a question in the product words', () => {
  it('asks about support in the words a person would use', () => {
    const labels = answerChoices('support', VOCABULARY).map((entry) => entry.label);

    expect(labels).toEqual([
      'Relationships',
      'Work or career',
      'Family',
      'Life changes',
      'Feeling overwhelmed',
      'Something else',
    ]);
  });

  it('asks about conversation without exposing a vocabulary name', () => {
    const labels = answerChoices('conversation', VOCABULARY).map((entry) => entry.label);

    expect(labels).toEqual([
      'Someone who helps me explore things',
      'Someone who gives me structure',
      'Someone who asks thoughtful questions',
      'Someone who helps me work toward practical steps',
      'I’m not sure yet',
    ]);

    for (const internal of ['Exploratory', 'Structured', 'Reflective', 'Solution-focused']) {
      expect(labels).not.toContain(internal);
    }
  });

  it('asks about context, and says it is optional', () => {
    const labels = answerChoices('context', VOCABULARY).map((entry) => entry.label);

    expect(labels).toContain('Someone familiar with Indian family dynamics');
    expect(labels).toContain('Nothing specific comes to mind');
    expect(questions.find((q) => q.id === 'context')?.skippable).toBe(true);
  });

  it('offers the common languages first and keeps the rest behind a shortlist', () => {
    const labels = answerChoices('language', VOCABULARY).map((entry) => entry.label);

    expect(labels.slice(0, 5)).toEqual(['English', 'Hindi', 'Bengali', 'Tamil', 'Malayalam']);
    expect(labels).toContain('French');
    expect(LANGUAGE_SHORTLIST_SIZE).toBeLessThan(labels.length);
  });

  it('offers either as a real answer for sessions', () => {
    const labels = answerChoices('sessions', VOCABULARY).map((entry) => entry.label);

    expect(labels).toEqual(['Online', 'In person', 'Either is fine']);
  });

  it('never offers a term the database does not have', () => {
    const labels = answerChoices('support', VOCABULARY).map((entry) => entry.label);

    // `career-transitions` is in the vocabulary, so "Work or career" covers it.
    expect(labels).not.toContain('Career transitions');
  });

  it('drops a phrase whose key has gone, rather than offering something that would be rejected', () => {
    // The seed loses `burnout` — "Feeling overwhelmed" would then be a phrase with
    // no key behind it, and submitting it would be a 400.
    const withoutBurnout = {
      ...VOCABULARY,
      areasOfWork: VOCABULARY.areasOfWork.filter((term) => term.key !== 'burnout'),
    };

    expect(answerChoices('support', withoutBurnout).map((entry) => entry.label)).not.toContain(
      'Feeling overwhelmed',
    );
  });

  it('does not dump the whole taxonomy into a question that has six answers', () => {
    // The vocabulary has five areas of work and four styles here; the questions
    // offer what has been written for, which is fewer, never more. A larger
    // vocabulary must not make a question longer.
    // Five supported areas plus the "something else" way out; four styles plus
    // "I'm not sure yet".
    expect(answerChoices('support', VOCABULARY)).toHaveLength(6);
    expect(answerChoices('conversation', VOCABULARY)).toHaveLength(5);

    const grown: IntakeVocabulary = {
      ...VOCABULARY,
      areasOfWork: [
        ...VOCABULARY.areasOfWork,
        { key: 'sleep', name: 'Sleep' },
        { key: 'grief', name: 'Grief' },
        { key: 'burnout-recovery', name: 'Burnout recovery' },
      ],
    };

    expect(answerChoices('support', grown)).toHaveLength(6);
  });

  it('does not leak the vocabulary as label copy on a curated question', () => {
    for (const id of ['support', 'conversation', 'context', 'sessions'] as const) {
      const labels = answerChoices(id, VOCABULARY).map((entry) => entry.label);

      for (const term of [
        'Burnout',
        'Career transitions',
        'Solution-focused',
        'Reflective',
        'Exploratory',
        'Indian diaspora',
        'Relocation',
      ]) {
        expect(labels, `${id}: ${term}`).not.toContain(term);
      }
    }
  });
});

describe('answering a question', () => {
  it('records a support answer as a key, not as the words shown', () => {
    const draft = answer('support', choice('support', 'Family'), emptyDraft());

    expect(draft.areasOfWork).toEqual(['family-dynamics']);
  });

  it('clears the areas when "something else" is chosen', () => {
    const chosen = answer('support', choice('support', 'Family'), emptyDraft());
    const cleared = answer('support', choice('support', 'Something else'), chosen);

    expect(cleared.areasOfWork).toEqual([]);
  });

  it('records a language by its code', () => {
    const draft = answer('language', choice('language', 'Hindi'), emptyDraft());

    expect(draft.languages).toEqual(['hi']);
  });

  it('treats "either is fine" as both formats', () => {
    const draft = answer('sessions', choice('sessions', 'Either is fine'), emptyDraft());

    expect(draft.sessionFormats).toEqual(['in-person', 'online']);
  });

  it('replaces a session choice rather than adding to it', () => {
    const either = answer('sessions', choice('sessions', 'Either is fine'), emptyDraft());
    const online = answer('sessions', choice('sessions', 'Online'), either);

    expect(online.sessionFormats).toEqual(['online']);
  });

  it('clears the contexts when "nothing specific" is chosen', () => {
    const chosen = answer(
      'context',
      choice('context', 'Someone experienced with relocation'),
      emptyDraft(),
    );
    expect(chosen.contextualExperiences).toEqual(['relocation']);

    const cleared = answer('context', choice('context', 'Nothing specific comes to mind'), chosen);

    expect(cleared.contextualExperiences).toEqual([]);
  });

  it('toggles days and parts of the day for availability', () => {
    let draft = answerDay(emptyDraft(), 'TUESDAY');
    draft = answerDay(draft, 'TUESDAY');
    expect(draft.days).toEqual([]);

    draft = answerTimeOfDay(draft, 'evening');
    expect(draft.timeOfDay).toEqual(['evening']);
  });
});

describe('reading an answer back', () => {
  it('finds the words for a stored key', () => {
    expect(labelForKey('support', 'family-dynamics', VOCABULARY)).toBe('Family');
    expect(labelForKey('language', 'ta', VOCABULARY)).toBe('Tamil');
    expect(labelForKey('conversation', 'exploratory', VOCABULARY)).toBe(
      'Someone who helps me explore things',
    );
  });

  it('falls back to the key rather than showing nothing', () => {
    expect(labelForKey('support', 'gone', VOCABULARY)).toBe('gone');
  });

  it('reads "not sure yet" as its own answer, not as an empty list', () => {
    const draft = answer('conversation', choice('conversation', 'I’m not sure yet'), emptyDraft());

    expect(keysOf(draft, 'conversation')).toEqual([UNSURE]);
  });

  it('reads "nothing specific" as an empty context list', () => {
    const draft = answer(
      'context',
      choice('context', 'Nothing specific comes to mind'),
      emptyDraft(),
    );

    expect(keysOf(draft, 'context')).toEqual([]);
  });
});

describe('when a question counts as answered', () => {
  it('requires the four answers a recommendation cannot be explained without', () => {
    const draft = emptyDraft();

    expect(draftHasAnswer(draft, 'support')).toBe(false);
    expect(draftHasAnswer(draft, 'conversation')).toBe(false);
    expect(draftHasAnswer(draft, 'language')).toBe(false);
    expect(draftHasAnswer(draft, 'sessions')).toBe(false);
  });

  it('lets everything optional be left alone', () => {
    for (const id of ['context', 'availability', 'anything-else'] as const) {
      expect(draftHasAnswer(emptyDraft(), id), id).toBe(true);
    }
  });

  it('accepts "not sure yet" as a complete answer about conversation', () => {
    const draft = answer('conversation', choice('conversation', 'I’m not sure yet'), emptyDraft());

    expect(draftHasAnswer(draft, 'conversation')).toBe(true);
  });

  it('accepts an intake that is only a note in someone own words', () => {
    const draft = { ...emptyDraft(), rawText: 'I am not sure where to start.' };

    expect(draftHasAnswer(draft, 'support')).toBe(false);
    expect(draftHasAnswer(draft, 'anything-else')).toBe(true);
  });

  it('knows when a step is still empty, so it can say the question is optional', () => {
    expect(isDraftEmptyFor(emptyDraft(), 'context')).toBe(true);
    expect(isDraftEmptyFor(toggleArea(emptyDraft(), 'relationships'), 'support')).toBe(false);
    expect(isDraftEmptyFor(setSessionFormats(emptyDraft(), ['online']), 'sessions')).toBe(false);
  });
});
