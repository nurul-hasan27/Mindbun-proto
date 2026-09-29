import { describe, expect, it } from 'vitest';
import { guardTurn, inspectMessage } from './safety.js';

/**
 * The guard is a control, and these tests are what make it one.
 *
 * Every case below is either a person describing their own life, which must be allowed
 * through, or a person asking for care the product does not give, which must not. The two
 * are close together in the same sentences, and the difference is the whole test.
 */

describe('messages that must pass through untouched', () => {
  const allowed = [
    // The distinction that matters most. Describing a condition is what someone came here
    // to do; being told what they have is not something this product does.
    'I have been told I have anxiety and I do not know what to do about it.',
    "I've been through depression before and it is coming back.",
    'My mother died in the spring and I have not really talked about it.',
    'I feel like I am having a breakdown, honestly.',
    'I am on medication already and it is not doing much.',
    // Words that appear in the care-request patterns and must still be allowed, because a
    // keyword guard that fires on "therapy" would shut down the conversation it exists for.
    'I have never done therapy before and I do not know what to expect.',
    'I am looking for a therapist who speaks German.',
    'What should I look for in a therapist?',
    'Can you recommend a therapist?',
    'My therapist and I have stopped talking and I do not know what to do.',
    'I want to tell my therapist something I have not said before.',
    'I am not sure whether the treatment I had last year helped.',
    'Would I need a diagnosis for this to count?',
  ];

  for (const text of allowed) {
    it(`allows: "${text.slice(0, 62)}${text.length > 62 ? '…' : ''}"`, () => {
      expect(inspectMessage(text)).toEqual({ kind: 'allow' });
      expect(guardTurn([{ role: 'user', text }])).toBeNull();
    });
  }
});

describe('requests for care, diagnosis or treatment', () => {
  const refused = [
    'Do I have anxiety?',
    'Am I depressed?',
    'What medication should I take?',
    'Which antidepressants work for this?',
    'Can you diagnose me?',
    'Please treat me.',
    'What is wrong with me?',
    'Can you be my therapist?',
    'What therapy do I need?',
    'Prescribe something for the anxiety please.',
  ];

  for (const text of refused) {
    it(`redirects without a model: "${text}"`, () => {
      const outcome = inspectMessage(text);

      expect(outcome.kind).toBe('care-request');
      expect(outcome.kind === 'care-request' && outcome.reply).toMatch(/cannot give therapy/i);
    });
  }

  it('answers without asking a provider, and says so in the response', () => {
    const turn = guardTurn([{ role: 'user', text: 'Do I have anxiety?' }]);

    // `provider: 'guard'` is what the route reports, and a refused turn is never
    // summarisable: nothing about what to look for can be read out of it.
    expect(turn).toMatchObject({ readyToSummarise: false });
    expect(turn?.reply).toMatch(/I cannot give therapy, diagnose anything/i);
  });

  it('offers the thing it can help with, rather than only refusing', () => {
    const reply =
      guardTurn([{ role: 'user', text: 'What medication should I take?' }])?.reply ?? '';

    expect(reply).toMatch(/put into words what you are looking for/i);
  });
});

describe('mentions of self-harm', () => {
  const distress = [
    'I have been thinking about killing myself.',
    'Sometimes I think about suicide.',
    'I do not want to be here any more.',
    "What's the point, I would be better off dead.",
    'I want to hurt myself.',
  ];

  for (const text of distress) {
    it(`stops the conversation: "${text}"`, () => {
      const outcome = inspectMessage(text);

      expect(outcome.kind).toBe('distress');
      expect(outcome.kind === 'distress' && outcome.reply).toMatch(/findahelpline\.com/i);
      expect(outcome.kind === 'distress' && outcome.reply).toMatch(/stop this conversation/i);
    });
  }

  it('is handled before a care request, because it is not a request for anything', () => {
    // "do I need treatment" is both a care request and, in this sentence, distress. It must
    // get the distress answer, because that is the one that points at real support.
    expect(inspectMessage('Do I need treatment, or am I going to end my life?').kind).toBe(
      'distress',
    );
  });

  it('never offers to keep matching after it has answered', () => {
    const turn = guardTurn([{ role: 'user', text: 'I have been thinking about suicide.' }]);

    expect(turn?.readyToSummarise).toBe(false);
  });

  it('gives a directory rather than guessing a national number for an unknown country', () => {
    const reply = guardTurn([{ role: 'user', text: 'I want to end my life.' }])?.reply ?? '';

    expect(reply).toMatch(/emergency number/i);
    // A specific hotline number would be a guess about where someone is.
    expect(reply).not.toMatch(/\b\d{3}\b/);
  });
});

describe('which message is inspected', () => {
  it('looks only at the newest user message, not the whole transcript', () => {
    // A conversation that went through this ten turns ago should not shut down the eleventh.
    // The turn that mentioned it already dealt with it.
    expect(
      guardTurn([
        { role: 'user', text: 'I was thinking about suicide once, years ago.' },
        { role: 'assistant', text: 'That sounds painful. Tell me more about now.' },
        { role: 'user', text: 'These days it is mostly work. I would rather talk it through.' },
      ]),
    ).toBeNull();
  });

  it('ignores assistant messages, so the assistant cannot guard itself shut', () => {
    expect(
      guardTurn([
        { role: 'user', text: 'Work has been stressful.' },
        { role: 'assistant', text: 'Do I have anxiety?' },
      ]),
    ).toBeNull();
  });

  it('allows a turn with no user message at all', () => {
    expect(guardTurn([{ role: 'assistant', text: 'Hello.' }])).toBeNull();
    expect(guardTurn([])).toBeNull();
  });
});
