import { useId } from 'react';
import { cx } from '../lib/cx';
import type { Choice } from '../lib/intake/questions';

interface ChoiceOptionProps {
  readonly choice: Choice;
  readonly name: string;
  readonly type: 'checkbox' | 'radio';
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly describedBy?: string;
}

/**
 * One answer, as a row of text rather than a box.
 *
 * The control is a real `<input type="checkbox">` or `type="radio"`, so arrow
 * keys, form submission and assistive technology all work without being
 * reimplemented. Everything visible is a label: no custom widget, no hidden
 * checkbox, no `role` to keep in step by hand.
 *
 * The selected state carries a clay rule, a clay tint and a small mark, so it is
 * never signalled by colour alone.
 */
export function ChoiceOption({
  choice,
  name,
  type,
  checked,
  onChange,
  describedBy,
}: ChoiceOptionProps) {
  const inputId = useId();
  const noteId = `${inputId}-note`;

  return (
    <label
      htmlFor={inputId}
      // `data-checked` is what lets a test assert the visible selected state
      // rather than trusting that a colour class is doing the work.
      data-checked={checked}
      className={cx(
        'group border-line focus-within:border-clay-400 hover:border-clay-300 ease-gentle flex cursor-pointer items-start gap-4 border-b py-4 transition-colors duration-200',
        checked && 'border-clay-300 bg-clay-50 rounded-control -mx-4 px-4',
      )}
    >
      {/*
        `sr-only` rather than `hidden`: the input must stay focusable and
        reachable by a screen reader, and the focus ring is drawn by the label's
        `focus-within` border.
      */}
      <input
        id={inputId}
        name={name}
        type={type}
        checked={checked}
        onChange={onChange}
        aria-describedby={
          choice.note === undefined ? describedBy : `${noteId} ${describedBy ?? ''}`.trim()
        }
        className="sr-only"
      />

      <span
        aria-hidden="true"
        className={cx(
          'ease-gentle mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center border transition-colors duration-200',
          type === 'radio' ? 'rounded-full' : 'rounded-[0.2rem]',
          checked ? 'border-clay-600 bg-clay-600' : 'border-line-strong bg-transparent',
        )}
      >
        {checked &&
          (type === 'radio' ? (
            <span className="bg-surface h-1.5 w-1.5 rounded-full" />
          ) : (
            <span className="bg-surface h-1.5 w-1.5 rounded-[0.05rem]" />
          ))}
      </span>

      <span className="min-w-0">
        <span
          className={cx(
            'text-body block text-pretty',
            checked ? 'text-ink font-medium' : 'text-ink-muted group-hover:text-ink',
          )}
        >
          {choice.label}
        </span>

        {choice.note !== undefined && (
          <span id={noteId} className="text-small text-ink-faint mt-1 block text-pretty">
            {choice.note}
          </span>
        )}
      </span>
    </label>
  );
}
