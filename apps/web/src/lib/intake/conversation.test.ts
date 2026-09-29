import { describe, expect, it, beforeEach } from 'vitest';
import {
  MAX_STORED_MESSAGES,
  appendMessage,
  clearConversation,
  loadConversation,
  saveConversation,
} from './conversation';

/**
 * Where the conversation lives between page loads.
 *
 * The claim under test is a privacy one, and it is specific: **only what the person typed is
 * stored, and only for as long as the tab is open.** A stored suggestion would be a stored
 * *inference about someone*, which is a different kind of thing to leave lying around, and
 * that is why `saveConversation` takes messages and nothing else.
 */

const KEY = 'wtm.intake.conversation.v1';

beforeEach(() => {
  globalThis.sessionStorage.clear();
});

describe('round-tripping', () => {
  it('restores what was said', () => {
    const messages = [
      { role: 'assistant' as const, text: 'Tell me in your own words.' },
      { role: 'user' as const, text: 'Work has been stressful.' },
    ];

    saveConversation(messages);

    expect(loadConversation()).toEqual(messages);
  });

  it('reports an empty conversation rather than a failure', () => {
    expect(loadConversation()).toEqual([]);
  });

  it('removes the entry entirely when there is nothing to keep', () => {
    saveConversation([{ role: 'user', text: 'Something.' }]);
    saveConversation([]);

    // An empty array would be a key holding "[]", which is a stored fact about a tab that
    // had a conversation in it, for no benefit.
    expect(globalThis.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('forgets everything when asked', () => {
    saveConversation([{ role: 'user', text: 'Something.' }]);
    clearConversation();

    expect(loadConversation()).toEqual([]);
  });
});

describe('nothing else is stored', () => {
  it('holds only roles and text, and nothing derived', () => {
    saveConversation([
      { role: 'user', text: 'Work has been stressful.' },
      { role: 'assistant', text: 'What is the harder part?' },
    ]);

    const stored: unknown = JSON.parse(globalThis.sessionStorage.getItem(KEY) ?? '[]');

    expect(Array.isArray(stored)).toBe(true);
    for (const entry of stored as unknown[]) {
      // No identifiers, no provider name, no suggestions, no timestamps. Nothing inferred
      // about anybody.
      expect(Object.keys(entry as object).sort()).toEqual(['role', 'text']);
    }
  });
});

describe('untrusted storage', () => {
  it('survives a value that is not JSON', () => {
    globalThis.sessionStorage.setItem(KEY, 'not json at all');

    expect(loadConversation()).toEqual([]);
  });

  it('survives a value that is JSON but not a list', () => {
    for (const stored of ['null', '42', '"text"', '{"role":"user"}']) {
      globalThis.sessionStorage.setItem(KEY, stored);
      expect(loadConversation()).toEqual([]);
    }
  });

  it('drops the entries it cannot trust and keeps the rest', () => {
    // Storage is not ours: it can be edited, and a half-valid transcript is more likely than
    // a wholly invalid one. Losing everything a person typed because one entry was wrong
    // would be the worse failure.
    globalThis.sessionStorage.setItem(
      KEY,
      JSON.stringify([
        { role: 'user', text: 'First thing I said.' },
        { role: 'narrator', text: 'Not a role.' },
        { role: 'assistant' },
        { text: 'No role at all.' },
        { role: 'user', text: 'Second thing I said.' },
      ]),
    );

    expect(loadConversation()).toEqual([
      { role: 'user', text: 'First thing I said.' },
      { role: 'user', text: 'Second thing I said.' },
    ]);
  });

  it('refuses an empty message', () => {
    globalThis.sessionStorage.setItem(KEY, JSON.stringify([{ role: 'user', text: '' }]));

    expect(loadConversation()).toEqual([]);
  });
});

describe('the cap', () => {
  it('keeps the newest turns, dropping the oldest', () => {
    const long = Array.from({ length: MAX_STORED_MESSAGES + 20 }, (_unused, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `Message ${index}`,
    }));

    saveConversation(long);
    const restored = loadConversation();

    expect(restored).toHaveLength(MAX_STORED_MESSAGES);
    // The oldest goes, the newest stays: a conversation is read from where it ends.
    expect(restored[restored.length - 1]?.text).toBe(`Message ${long.length - 1}`);
  });

  it('caps on append as well, so a long conversation cannot grow without limit in memory', () => {
    let messages = appendMessage([], { role: 'user', text: 'First.' });

    for (let index = 1; index <= MAX_STORED_MESSAGES + 5; index += 1) {
      messages = appendMessage(messages, { role: 'user', text: `Message ${index}.` });
    }

    expect(messages).toHaveLength(MAX_STORED_MESSAGES);
  });

  it('never mutates the array it was given', () => {
    const original = [{ role: 'user' as const, text: 'One.' }];
    const next = appendMessage(original, { role: 'assistant', text: 'Two.' });

    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});
