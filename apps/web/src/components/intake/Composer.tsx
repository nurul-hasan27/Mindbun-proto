import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '../Button';
import { cx } from '../../lib/cx';

/**
 * The composer: one field, one send.
 *
 * ## Enter sends, Shift+Enter does not
 *
 * A conversation where Enter inserts a newline is a conversation that takes four extra
 * keystrokes per paragraph, and one where Enter does *not* send cannot put a line break in at
 * all. Shift+Enter is the convention that has survived every other convention.
 *
 * Announced through the field's own `aria-describedby` rather than a hidden sentence, so it
 * is available when the label is read and not only to somebody hunting for it.
 *
 * ## Nothing is sent until it is sent
 *
 * There is no debounce, no request on a keystroke, and no call from an effect. The value is
 * local state and the request happens in this component's submit handler, once, which is why
 * React's strict-mode double-invocation cannot produce two turns: the effect that would
 * trigger it does not exist.
 */

interface ComposerProps {
  readonly onSend: (text: string) => void;
  readonly disabled?: boolean;
  /** Why the field cannot be used, or null. Announced politely rather than as an error. */
  readonly unavailableReason?: string | null;
  readonly className?: string;
}

/** Long enough for a paragraph. The server refuses more, and the counter says so. */
const MAX_LENGTH = 4_000;

export function Composer({
  onSend,
  disabled = false,
  unavailableReason = null,
  className,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const labelId = useId();
  const helpId = useId();
  const counterId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  const tooLong = value.length > MAX_LENGTH;
  const canSend = !disabled && value.trim() !== '' && !tooLong;

  // Grow the field to fit what was written.
  //
  // A fixed `rows` is wrong in both directions: at eight rows the send button sits below the
  // fold on a 320px screen before a word is typed, and at two rows a paragraph is scrolled
  // inside a small box while the person is still writing it — the worst place to hide text
  // you cannot see the end of.
  //
  // Done in JavaScript rather than with `field-sizing: content` because that property is
  // recent and its support is uneven; a plain height calculation works everywhere and costs
  // one layout read on change.
  useLayoutEffect(() => {
    const node = field.current;

    if (node === null) {
      return;
    }

    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  const submit = (event?: FormEvent): void => {
    event?.preventDefault();

    if (!canSend) {
      return;
    }

    // The field is cleared *before* the request, not after it resolves. A failed turn still
    // leaves the words in the transcript — the server got them — so clearing early cannot
    // lose anything, and waiting would leave a person staring at a full box wondering whether
    // it sent.
    const text = value.trim();
    setValue('');
    field.current?.focus();
    onSend(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className={cx('w-full', className)} onSubmit={submit}>
      <label htmlFor={labelId} className="text-label text-ink-muted block uppercase">
        {disabled ? 'The assistant is switched off' : 'In your own words'}
      </label>

      <textarea
        id={labelId}
        ref={field}
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={cx(helpId, tooLong ? counterId : undefined)}
        className={cx(
          'placeholder:text-ink-faint text-body text-ink border-line-strong mt-3 w-full resize-none rounded-control border bg-transparent px-4 py-3 transition-colors duration-200',
          'placeholder:font-body focus:border-clay-400 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
        placeholder={
          disabled
            ? 'The questions are still waiting for you below.'
            : 'Type as much or as little as you like.'
        }
      />

      <p id={helpId} className="text-micro text-ink-faint mt-2 text-pretty">
        {unavailableReason ?? 'Enter sends it. Shift and Enter start a new line.'}
      </p>

      {tooLong && (
        <p id={counterId} className="text-micro text-clay-700 mt-2" role="alert">
          That is {value.length.toLocaleString('en-GB')} characters. A message can be up to{' '}
          {MAX_LENGTH.toLocaleString('en-GB')}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button type="submit" unavailable={!canSend} unavailableHint="Type a message to send it.">
          Send
        </Button>
      </div>
    </form>
  );
}
