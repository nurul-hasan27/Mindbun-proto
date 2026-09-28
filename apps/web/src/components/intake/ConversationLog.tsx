import type { AiMessage } from '../../lib/api/ai';
import { cx } from '../../lib/cx';

/**
 * The conversation, as a piece of writing rather than a chat log.
 *
 * ## Why there are no bubbles
 *
 * Every convention here — two columns, rounded tails, alternating alignment — is a way of
 * saying "this is a messaging app", and this is not one. It is an interview that happens to
 * be typed. So the transcript is a single column of prose with a quiet marker for who spoke,
 * the way a transcript in a book or a research paper is set.
 *
 * A question is also answered better by a question than by a bubble. Somebody telling a
 * stranger something difficult is not in a conversation with an equal; a two-column layout
 * asserts that they are, and the layout can carry that claim no matter what the words say.
 *
 * ## The reading measure
 *
 * `max-w-measure` and nothing wider. A line of prose is comfortable at roughly sixty-five
 * characters, and a conversational turn is prose — it wants the same measure a paragraph in
 * a book wants, not the full width of a screen.
 */

interface ConversationLogProps {
  readonly messages: readonly AiMessage[];
  /**
   * How many messages have already been announced.
   *
   * An index rather than a count of the new ones, so the live region holds *only* what has
   * not been read yet. A screen reader should be told about the reply that just arrived and
   * nothing else — a region that re-contains the whole transcript on every turn announces
   * the entire conversation again, which is worse than saying nothing.
   */
  readonly announcedUpTo: number;
  readonly className?: string;
}

export function ConversationLog({ messages, announcedUpTo, className }: ConversationLogProps) {
  return (
    <>
      {/*
        The live region. `aria-live="polite"` so a reply is announced when it arrives and
        never interrupts whatever is being read, and `aria-relevant="additions text"` so
        appending a turn announces that turn rather than the whole transcript.
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
            {message.role === 'assistant' ? 'Assistant' : 'You'}: {message.text}
          </p>
        ))}
      </div>

      <ol className={cx('flex flex-col', className)}>
        {messages.map((message, index) => (
          <li key={`${index}-${message.role}-${message.text.slice(0, 12)}`}>
            <Turn message={message} />
          </li>
        ))}
      </ol>
    </>
  );
}

function Turn({ message }: { readonly message: AiMessage }) {
  const fromUser = message.role === 'user';

  return (
    <div
      /*
       * Beside the prose above `sm`, above it below.
       *
       * "ASSISTANT" is nine characters of letterspaced small capitals. In a column it needs
       * 5.25rem, and at 320px that is 29% of the line for a label — the prose wraps to
       * nine words a line and reads worse than it needs to. A truncated "ASSISTA…" is worse
       * still, because it is the word most likely to be about.
       *
       * So the two-column arrangement is the wide-screen form and the stacked one is the
       * narrow form, which is what the rest of this product already does. The column is
       * fixed rather than `auto` so the prose starts on one edge at every width instead of
       * stepping sideways between turns.
       */
      className={cx(
        'border-line grid grid-cols-1 gap-y-1 border-t py-5',
        'sm:grid-cols-[5.25rem_1fr] sm:gap-x-5 sm:gap-y-0 sm:py-6',
      )}
    >
      <p className={cx('text-label uppercase', fromUser ? 'text-ink-faint' : 'text-clay-700')}>
        {fromUser ? 'You' : 'Assistant'}
      </p>

      {/*
        `text-pretty` rather than `text-balance`: these are two or three sentences, not a
        heading, and balancing them across three lines is the kind of thing that looks
        deliberate right up until there are eight words in the sentence.
      */}
      <p className="text-body text-ink min-w-0 text-pretty">{message.text}</p>
    </div>
  );
}
