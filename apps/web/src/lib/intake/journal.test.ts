import { describe, expect, it } from 'vitest';
import {
  JOURNEY_STAGES,
  entriesFor,
  promptsAreUseful,
  stageFor,
  turnCount,
  WRITING_STARTERS,
} from './journal';
import type { AiMessage } from '../api/ai';

/**
 * How a transcript becomes a page.
 *
 * These are the decisions that keep the experience from being a chat log, and they are
 * functions rather than markup so they can be asserted here — a change to the visual
 * treatment of a turn cannot quietly change which turns are treated as questions.
 */

const said = (text: string): AiMessage => ({ role: 'user', text });
const replied = (text: string): AiMessage => ({ role: 'assistant', text });

const CONVERSATION: readonly AiMessage[] = [
  replied("You don't need to know what kind of therapy you need."),
  said('I have been overwhelmed at work.'),
  replied('That sounds like a lot to carry.'),
];

describe('what a turn is made of', () => {
  it('treats an assistant turn somebody is going to answer as a question', () => {
    const entries = entriesFor(CONVERSATION);

    // The greeting is an assistant turn, and it is a question, because the page invites an
    // answer to it. Deciding this by role instead — every assistant line being a reply —
    // is what makes a transcript read as a transcript.
    expect(entries[0]?.kind).toBe('prompt');
    expect(entries[0]?.text).toBe("You don't need to know what kind of therapy you need.");
  });

  it('treats what the person wrote as the subject of the page', () => {
    expect(entriesFor(CONVERSATION)[1]?.kind).toBe('words');
  });

  it('treats the last assistant turn as a reflection, because it answers what came before', () => {
    const entries = entriesFor(CONVERSATION);

    expect(entries[2]?.kind).toBe('reflection');
    expect(entries[2]?.text).toBe('That sounds like a lot to carry.');
  });

  it('reads an opening line as a question even with nothing after it', () => {
    // A fresh visit. There is no reflection here, only the invitation — and calling it a
    // reflection would put a margin note above the first thing anybody reads.
    expect(entriesFor([replied('Tell me what has been going on.')])[0]?.kind).toBe('prompt');
  });

  it('reads the newest turn as a reflection while it is still the newest', () => {
    // A person has written and is waiting. The assistant's answer is the last thing on the
    // page, so it is a reflection rather than a question nobody is going to be asked yet.
    const entries = entriesFor([
      said('Work has been stressful.'),
      replied('What is the hard part?'),
    ]);

    expect(entries[1]?.kind).toBe('reflection');
  });

  it('keeps every turn, in order, so nothing is dropped or reordered', () => {
    const entries = entriesFor(CONVERSATION);

    expect(entries.map((entry) => entry.at)).toEqual([0, 1, 2]);
    expect(entries).toHaveLength(CONVERSATION.length);
  });

  it('composes an empty transcript to nothing', () => {
    expect(entriesFor([])).toEqual([]);
  });
});

describe('where somebody is', () => {
  it('names parts of getting to know you rather than counting messages', () => {
    expect(JOURNEY_STAGES).toEqual([
      'What brings you here',
      'How you’d like to talk',
      'What matters to you',
      'Finding your fit',
    ]);
  });

  it('starts at the beginning before anything is written', () => {
    expect(stageFor({ messages: [replied('Hello.')], showingUnderstanding: false })).toBe(0);
  });

  it('moves on once something has been written', () => {
    expect(stageFor({ messages: CONVERSATION, showingUnderstanding: false })).toBe(1);
  });

  it('advances with the exchange rather than with anything about the writing', () => {
    // One long paragraph and one short sentence are both a first answer, and they land in
    // the same place: the stage follows how far the conversation has got, not how much was
    // typed, because what somebody wrote at length is not further along than what they
    // wrote briefly.
    const longAnswer = [said('A very long answer, going on for a while.'), replied('Thank you.')];
    const shortAnswer = [said('Work.'), replied('Thank you.')];

    expect(stageFor({ messages: longAnswer, showingUnderstanding: false })).toBe(
      stageFor({ messages: shortAnswer, showingUnderstanding: false }),
    );
  });

  it('advances when a further exchange happens', () => {
    const oneExchange = [said('One.'), replied('One.')];
    const twoExchanges = [said('One.'), replied('One.'), said('Two.'), replied('Two.')];

    expect(stageFor({ messages: twoExchanges, showingUnderstanding: false })).toBeGreaterThan(
      stageFor({ messages: oneExchange, showingUnderstanding: false }),
    );
  });

  it('never reports a number, because a person sees a name or nothing', () => {
    for (const stage of JOURNEY_STAGES) {
      expect(stage).not.toMatch(/\d/);
    }
  });

  it('arrives at the last stage when the understanding is on the page', () => {
    expect(stageFor({ messages: CONVERSATION, showingUnderstanding: true })).toBe(
      JOURNEY_STAGES.length - 1,
    );
  });

  it('does not go backwards, because reading it again is still the last stage', () => {
    const atUnderstanding = stageFor({ messages: CONVERSATION, showingUnderstanding: true });

    // Understanding is offered again rather than withdrawn, so a stage that regressed
    // would read as something having been undone.
    expect(stageFor({ messages: CONVERSATION, showingUnderstanding: false })).toBeLessThan(
      atUnderstanding,
    );
  });

  it('never runs past the last stage, whatever it is handed', () => {
    expect(stageFor({ messages: CONVERSATION, showingUnderstanding: true })).toBeLessThanOrEqual(
      JOURNEY_STAGES.length - 1,
    );
  });
});

describe('counting turns', () => {
  it('counts what the person wrote, not what was said to them', () => {
    expect(turnCount(CONVERSATION)).toBe(1);
  });

  it('is zero for an untouched page', () => {
    expect(turnCount([replied('Hello.')])).toBe(0);
  });
});

describe('when the writing prompts are worth showing', () => {
  it('shows them on a page nobody has written on', () => {
    expect(promptsAreUseful([replied('Tell me what has been going on.')], '')).toBe(true);
  });

  it('stops offering them once something has been written', () => {
    // Somebody who has just found the right words and is offered three ways to begin has
    // been told, quietly, that they have not started yet.
    expect(promptsAreUseful(CONVERSATION, '')).toBe(false);
  });

  it('stops offering them the moment a starter is used', () => {
    // A starter fills the page, and an open prompt underneath a filled one is a nudge to
    // start over.
    expect(promptsAreUseful([replied('Hello.')], "I've been feeling")).toBe(false);
  });

  it('offers ways into writing rather than answers to it', () => {
    // Every one is an unfinished sentence. A chip supplies an answer and pressing one
    // transmits a decision, which is the wrong affordance on a page about taking time.
    for (const starter of WRITING_STARTERS) {
      expect(starter.endsWith('…')).toBe(true);
    }
  });
});
