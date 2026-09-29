import type { AiMessage } from '../api/ai';

/**
 * How a transcript becomes a page.
 *
 * ## The rule everything else follows from
 *
 * **A turn is not a message.** In a chat log each message is one visual object, and the
 * interface is a column of them — which is the shape, and the feeling, of talking to a
 * machine. Here a turn is three things with three different weights, and the weights are
 * what say *person → reflection → understanding* rather than *user → assistant*:
 *
 * - A **question** is the largest thing on the page. It is Fraunces, and it is a question
 *   being asked of somebody rather than a line being sent at something.
 * - **The words** are the warm centre. Also Fraunces, one step smaller, at full ink. No
 *   bubble, no border, no tinted panel, no alignment — their typography says "this is what
 *   someone wrote" far better than a container ever could.
 * - A **reflection** recedes. Inter, small, muted, behind a short clay hairline. It reads
 *   as a note written in the margin of what was just said, which is exactly what it is.
 *
 * ## Deciding which is which
 *
 * Not by role alone. An assistant turn that *someone is going to answer* is a question; an
 * assistant turn that *answers what was just said* is a reflection. The difference is
 * whether a person answered it — so it is decided by what follows, not by who spoke.
 *
 * That single rule is what makes the opening work. The greeting is an assistant turn, and
 * it is a question, because the page invites an answer to it.
 *
 * ## Pure on purpose
 *
 * Every decision here is a function of its input, so the composition can be asserted in a
 * unit test without rendering, and a change to the visual treatment cannot quietly change
 * which turn is treated as a question.
 */

/** One element of the composed page. */
export type JournalEntry =
  /** An assistant turn the person is being invited to answer. */
  | { readonly kind: 'prompt'; readonly text: string; readonly at: number }
  /** What the person wrote. The subject of the page. */
  | { readonly kind: 'words'; readonly text: string; readonly at: number }
  /** An assistant turn answering what was just written. */
  | { readonly kind: 'reflection'; readonly text: string; readonly at: number };

/**
 * The transcript, composed.
 *
 * An assistant turn is a **question** when somebody is going to answer it — either because a
 * person follows it, or because it is the very first thing on the page. It is a
 * **reflection** otherwise, meaning it is answering what was just written.
 *
 * Both halves are needed, and the first version had only one:
 *
 * - "Followed by an answer" alone makes a fresh visit wrong. On arrival the greeting *is*
 *   the last message, so the page would open with a margin note above the first thing
 *   anybody reads, which is the one place a margin note cannot go.
 * - "Preceded by an answer" alone makes every question in the middle wrong. After a person
 *   has written once, the assistant's next question would be treated as a reflection of
 *   what came before — so the prompts would stop being prompts exactly when the
 *   conversation started to feel like one.
 */
export function entriesFor(messages: readonly AiMessage[]): readonly JournalEntry[] {
  return messages.map((message, at) => {
    if (message.role === 'user') {
      return { kind: 'words', text: message.text, at };
    }

    const isQuestion = at === 0 || messages[at + 1]?.role === 'user';

    return isQuestion
      ? { kind: 'prompt', text: message.text, at }
      : { kind: 'reflection', text: message.text, at };
  });
}

/** How many times the person has written. */
export function turnCount(messages: readonly AiMessage[]): number {
  return messages.filter((message) => message.role === 'user').length;
}

/**
 * The stages, in the order a person actually moves through them.
 *
 * The names are the parts of the intake rather than counts of messages, because a counter
 * makes the conversation feel like a transaction and a journey does not. They are also the
 * words the ordinary questions use, so the two halves of the intake describe themselves the
 * same way.
 */
export const JOURNEY_STAGES = [
  'What brings you here',
  'How you’d like to talk',
  'What matters to you',
  'Finding your fit',
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

interface StageInput {
  readonly messages: readonly AiMessage[];
  /** Whether the reflected understanding is on the page yet. */
  readonly showingUnderstanding: boolean;
}

/**
 * Where somebody is, as a stage.
 *
 * Derived from the transcript rather than shown as a count, and the distinction matters more
 * than it looks: a person sees a *name*, never a number and never a fraction, so nothing
 * here is keeping score and nobody is being moved along a queue. What a transcript can
 * honestly say before the understanding is shown is how far the exchange has got, and that
 * is what the middle stages are named after.
 *
 * The understanding stage is never left once entered: offering to read it back again stays
 * available, and a stage that went backwards would read as a mistake.
 */
export function stageFor({ messages, showingUnderstanding }: StageInput): number {
  if (showingUnderstanding) {
    return JOURNEY_STAGES.length - 1;
  }

  const turns = turnCount(messages);

  if (turns === 0) return 0;
  if (turns === 1) return 1;
  return 2;
}

/**
 * Whether the written prompts are worth offering.
 *
 * Only before anything has been written. Somebody who has just found the right words and is
 * offered three ways to start would be told, quietly, that they had not started yet — and
 * the prompts have done their job by then.
 */
export function promptsAreUseful(messages: readonly AiMessage[], draft: string): boolean {
  return turnCount(messages) === 0 && draft.trim() === '';
}

/**
 * Openings, written as sentence starters.
 *
 * They complete a thought rather than name a topic, which is the whole difference between a
 * writing prompt and a suggestion chip: a chip offers an answer, a starter offers a way into
 * writing one. They fill the page and are never sent — a click that transmits a decision is
 * the wrong affordance on a page about taking your time.
 */
export const WRITING_STARTERS = [
  'I’ve been feeling…',
  'I’m looking for someone who…',
  'I’d feel more comfortable if…',
] as const;
