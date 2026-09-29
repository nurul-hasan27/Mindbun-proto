import type { AiMessage } from '../../lib/api/ai';
import { entriesFor } from '../../lib/intake/journal';
import { useScrollToNewest } from './useScrollToNewest';

/**
 * The conversation, set as a page rather than as a log.
 *
 * ## Why there is no transcript here
 *
 * A transcript is a list of utterances by two parties, and every visual convention that goes
 * with it — two columns, alternating alignment, a tinted panel per side, a name on each —
 * exists to make that list scannable. It also makes the reader a party in it.
 *
 * Somebody describing something difficult to a stranger is not in a conversation with an
 * equal, and a two-column layout says they are whatever the words happen to say. So the page
 * has no columns, no bubbles, and no speaker names. The three kinds of line differ by weight
 * alone, and the order is always question → words → reflection, which is the order a person
 * experiences the exchange in rather than the order two endpoints alternated.
 *
 * `entriesFor` decides the weights; this file only draws them.
 *
 * ## Why the person's words are the largest running text
 *
 * Not the questions. On a page about working something out, the most prominent thing should
 * be the thinking, not the asking — and a person rereading what they wrote is the moment the
 * page is most useful.
 *
 * This was backwards at first, and the browser is what showed it: the question was set a
 * step *larger* than the words, so the page asked louder than it listened, and a screenshot
 * of it read as a wall of the same serif with no way to tell who had said what. A question
 * you have been asked is scaffolding. What you said in reply is the building — so the words
 * take the larger step and full ink, and the question steps back into the quieter ink.
 *
 * Two signals separate them, not one: size *and* colour, so the distinction survives a
 * monochrome screen and does not depend on anyone telling them which is which.
 */

interface ReflectionJournalProps {
  readonly messages: readonly AiMessage[];
  /** How many messages a screen reader has been told about. */
  readonly announcedUpTo: number;
  readonly className?: string;
}

export function ReflectionJournal({ messages, announcedUpTo, className }: ReflectionJournalProps) {
  const entries = entriesFor(messages);
  const end = useScrollToNewest(messages.length);

  return (
    <div className={className}>
      {/*
        The live region holds only what has just arrived, indexed rather than counted, so a
        reply is announced once and the whole conversation is not re-read on every turn. A
        region containing everything re-announces everything each time it changes, which is
        worse than not announcing at all.
      */}
      <div
        className="sr-only"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
      >
        {messages.slice(announcedUpTo).map((message, index) => (
          <p key={`${announcedUpTo + index}-${message.role}`}>
            {message.role === 'assistant' ? 'Question' : 'Your words'}: {message.text}
          </p>
        ))}
      </div>

      {/*
        A list, and named. It is not a list of messages — there are no messages — it is the
        page so far, and saying so means a screen reader announces a region rather than
        several anonymous items.
      */}
      <ol aria-label="What has been written so far">
        {entries.map((entry) => (
          <li key={`${entry.at}-${entry.kind}`} className={spacingFor(entry.kind)}>
            {entry.kind === 'prompt' ? (
              <p className="arrive-prompt font-display text-lead text-ink-muted text-pretty">
                {entry.text}
              </p>
            ) : entry.kind === 'words' ? (
              <p className="arrive-words font-display text-subheading text-ink text-pretty">
                {entry.text}
              </p>
            ) : (
              <Reflection text={entry.text} />
            )}
          </li>
        ))}
      </ol>

      <div ref={end} aria-hidden="true" className="h-px" />
    </div>
  );
}

/**
 * A reflection: a margin note on what was just written.
 *
 * Set in the body face, a step smaller and a step quieter than the words above it, behind a
 * short clay rule. The rule is the only thing separating it from the words, and it is short
 * on purpose — a full-width line would make the reflection into another section heading,
 * which is the reading this page is trying not to invite.
 *
 * Two or three sentences is what a reflection should be, so the measure is narrower than the
 * words'. A long reflection in this position stops being a reflection and becomes the
 * subject of the page, which is the opposite of the hierarchy.
 */
function Reflection({ text }: { readonly text: string }) {
  return (
    <div className="arrive-reflection">
      <span aria-hidden="true" className="bg-clay-400 block h-px w-8" />
      <p className="text-small text-ink-muted mt-3 max-w-[46ch] text-pretty">{text}</p>
    </div>
  );
}

/**
 * Space between entries, and nothing else.
 *
 * No rules between turns. Rules say "these are separate items in a list"; whitespace says
 * "this is space in a page", and the difference is the difference between a log and
 * something being written. The gaps are asymmetric on purpose — a question sits close to the
 * answer it is about to get, and a reflection sits further from both, because it is
 * answering what came before it rather than prompting what comes next.
 */
function spacingFor(kind: 'prompt' | 'words' | 'reflection'): string {
  if (kind === 'words') return 'mt-5';
  if (kind === 'reflection') return 'mt-9';
  return 'mt-12 first:mt-0';
}
