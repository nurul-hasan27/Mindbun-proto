import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowGlyph } from '../ArrowGlyph';
import { WRITING_STARTERS } from '../../lib/intake/journal';
import { cx } from '../../lib/cx';

/**
 * A private note, not a message box.
 *
 * ## The chrome is the message
 *
 * A chat input is a rounded rectangle with a border, sitting at the bottom of a column,
 * with a filled button beside it. Every one of those marks says _you are composing a message_
 * — and the person composing it is not, and this page has spent its whole composition
 * telling them so. So there is no box. There is a ruled line under the text, the way a
 * journal page is ruled, and the text sits on it.
 *
 * The action is a word and an arrow rather than a button. A filled button is a submission;
 * this is a page turning. It is a real `<button>`, still focusable, still with
 * `aria-disabled` when there is nothing written — the affordance is quieter, not weaker.
 *
 * ## The starters fill the page
 *
 * A writing prompt completes a thought. A suggestion chip supplies an answer, and pressing
 * one transmits a decision — the wrong thing for a page whose whole argument is that nothing
 * is decided quickly. So each starter is a sentence beginning, and pressing one puts it
 * under the cursor and does nothing else. Nothing leaves the browser until *Continue*.
 *
 * They appear only before anything has been written, and disappear afterwards. Somebody who
 * has just found the right words and is offered three ways to begin has been told, quietly,
 * that they have not started yet.
 */

interface NotepaperProps {
  readonly onContinue: (text: string) => void;
  readonly disabled?: boolean;
  /** Extra guidance shown under the line. Replaces the default while a turn is failing. */
  readonly guidance?: string | null;
  /** Whether the starters are worth showing. */
  readonly showStarters: boolean;
  readonly className?: string;
}

/** Long enough for a paragraph. The server refuses more, and the counter says so. */
const MAX_LENGTH = 4_000;

export function Notepaper({
  onContinue,
  disabled = false,
  guidance = null,
  showStarters,
  className,
}: NotepaperProps) {
  const [value, setValue] = useState('');
  const labelId = useId();
  const helpId = useId();
  const counterId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  const tooLong = value.length > MAX_LENGTH;
  const canSend = !disabled && value.trim() !== '' && !tooLong;

  /*
   * The line grows to fit what was written.
   *
   * A fixed height is wrong in both directions: at eight rows the action sits below the fold
   * on a phone before a word is typed, and at two rows a paragraph is scrolled inside a
   * small box while somebody is still writing it — the worst possible place to hide the end
   * of your own sentence.
   *
   * Measured in JavaScript rather than with `field-sizing: content`, which is recent enough
   * that support is uneven, and transitioned so the growth is a movement rather than a jump.
   */
  useLayoutEffect(() => {
    const node = field.current;

    if (node === null) {
      return;
    }

    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  const send = (): void => {
    if (!canSend) {
      return;
    }

    // Cleared *before* the request rather than after it resolves. A failed turn still leaves
    // the words in the journal — the server received them — so clearing early cannot lose
    // anything, and waiting leaves somebody staring at a full page unsure whether it went.
    const text = value.trim();
    setValue('');
    field.current?.focus();
    onContinue(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  /** A starter completes the thought already under the cursor, or starts one. */
  const beginWith = (starter: string): void => {
    const node = field.current;
    const current = value.trim();
    const next = current === '' ? starter : `${current} ${starter.replace('…', '')}`;

    setValue(next);
    node?.focus();

    if (node !== null) {
      node.setSelectionRange(next.length, next.length);
    }
  };

  return (
    <div className={className}>
      <label htmlFor={labelId} className="sr-only">
        In your own words
      </label>

      {/*
        The rule is the only boundary, and the focus ring is carried by whatever wraps the
        field rather than by the field itself.

        `.focus-within-ring` is the product's existing treatment for a control whose own box
        is invisible, and its stylesheet comment is written for exactly this case: the
        unfocused state already has a border, so a border *colour* change on focus is only a
        shade of a line — not something a keyboard user can rely on finding. So the wrapper
        takes the same 2px clay ring every button in the product has, and the rule warms as
        well, which is what a mouse user notices.
      */}
      <div className="focus-within-ring border-line-strong focus-within:border-clay-400 ease-gentle border-b transition-colors duration-300">
        <textarea
          id={labelId}
          ref={field}
          rows={3}
          value={value}
          disabled={disabled}
          maxLength={MAX_LENGTH + 200}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={cx(helpId, tooLong ? counterId : undefined)}
          className={cx(
            'placeholder:text-ink-faint placeholder:font-display w-full resize-none border-0 bg-transparent p-0',
            // Suppressed deliberately, because the wrapper draws it — see above. An
            // outline on a borderless, full-width text field is also the wrong shape: it
            // boxes a paragraph rather than marking a line.
            'focus:outline-none focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
          style={{
            // Display face, italic: this is a page being written in, not a form field being
            // filled in. The italic is a variable font we already ship.
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: '1.1875rem',
            lineHeight: '1.6',
          }}
          placeholder="Write whatever feels useful…"
        />
      </div>

      <p id={helpId} className="text-micro text-ink-faint mt-3 text-pretty">
        {guidance ?? 'Enter sends it. Shift and Enter start a new line. Nothing is saved yet.'}
      </p>

      {tooLong && (
        <p id={counterId} className="text-micro text-clay-700 mt-2" role="alert">
          That is {value.length.toLocaleString('en-GB')} characters. A note can be up to{' '}
          {MAX_LENGTH.toLocaleString('en-GB')}.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button
          type="button"
          onClick={send}
          aria-disabled={!canSend}
          className={cx(
            'link-quiet group text-body ease-gentle inline-flex items-center gap-2 font-medium transition-colors duration-200',
            canSend ? 'text-ink cursor-pointer' : 'text-ink-faint cursor-not-allowed',
          )}
        >
          Continue
          <ArrowGlyph />
          <span className="sr-only">
            {canSend ? 'and read what was written' : ' — write something first'}
          </span>
        </button>

        {showStarters && (
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {WRITING_STARTERS.map((starter) => (
              <li key={starter}>
                <button
                  type="button"
                  onClick={() => beginWith(starter)}
                  className="font-display text-small text-ink-muted hover:text-clay-700 cursor-pointer text-left italic transition-colors duration-200"
                >
                  {starter}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
