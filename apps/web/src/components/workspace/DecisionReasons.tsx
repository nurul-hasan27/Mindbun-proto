import { cx } from '../../lib/cx';
import { WorkspaceEyebrow } from './WorkspaceColumns';

/**
 * The reason picker.
 *
 * ## Why checkboxes and not radio buttons
 *
 * Several reasons can be true at once, and "better fit for what they asked for" plus
 * "stronger contextual experience" is one answer a matcher can mean. Radio buttons would
 * make them choose one and would then be storing a summary of their reasoning rather than
 * the reasoning itself.
 *
 * ## Why the input is visually hidden but not `display: none`
 *
 * `display: none` and `visibility: hidden` take an element out of the accessibility tree
 * *and* out of the tab order, so a checkbox nobody can reach is a checkbox nobody can
 * operate. The label is the visible control and the input is inside it, so clicking or
 * focusing either one works, and `.focus-within-ring` gives the label the same focus ring
 * the rest of the product uses — a one-pixel input would otherwise draw its ring on a
 * one-pixel box that nobody sees.
 */
interface DecisionReasonsProps {
  readonly reasons: readonly {
    readonly key: string;
    readonly name: string;
    readonly description: string;
  }[];
  readonly selected: readonly string[];
  readonly onToggle: (key: string) => void;
  /** Names of the inputs, for the error message's `aria-describedby`. */
  readonly describedBy?: string;
  /** Whether an alternative has been chosen, which is what makes a reason required. */
  readonly required: boolean;
}

export function DecisionReasons({
  reasons,
  selected,
  onToggle,
  describedBy,
  required,
}: DecisionReasonsProps) {
  return (
    <fieldset aria-describedby={describedBy}>
      {/*
        The legend carries the requirement rather than a marker beside the first option.
        A required sign on a checkbox reads as "this one is mandatory" when what is meant is
        "at least one of these", and the legend is the only place that distinction can be
        made without a paragraph.
      */}
      <legend className="text-label text-ink-muted font-medium uppercase">
        {required ? 'What made this a better fit' : 'Anything that helped (optional)'}
      </legend>

      <p id={describedBy} className="text-small text-ink-muted mt-3">
        {required
          ? 'Choose at least one. This is what the decision will say about itself later.'
          : 'You did not choose a different therapist, so nothing here needs explaining.'}
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {reasons.map((reason) => {
          const isOn = selected.includes(reason.key);

          return (
            <li key={reason.key}>
              <label
                className={cx(
                  'focus-within-ring border-line-strong hover:border-clay-300 rounded-control ease-gentle flex cursor-pointer items-start gap-3 border p-4 transition-colors duration-200',
                  isOn && 'border-clay-400 bg-clay-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => onToggle(reason.key)}
                  className="sr-only"
                />
                {/*
                  The tick is drawn rather than left to the browser, so it can carry the
                  product's own voice. It is `aria-hidden` because the input above already
                  announces the state — a tick that also announced it would be read twice.
                */}
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.3rem] border transition-colors duration-200',
                    isOn ? 'border-clay-700 bg-clay-700' : 'border-line-strong bg-surface',
                  )}
                >
                  {isOn && (
                    <svg viewBox="0 0 12 12" className="stroke-surface h-3 w-3 fill-none stroke-2">
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="text-body text-ink block">{reason.name}</span>
                  <span className="text-small text-ink-muted mt-0.5 block">
                    {reason.description}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * A short status line, in the product's voice rather than the browser's.
 *
 * Used for a refusal the matcher needs to read. `role="alert"` because a refusal that is
 * not announced is a refusal that reads as a button that silently did nothing.
 */
export function DecisionProblem({ children }: { readonly children: string }) {
  return (
    <p
      role="alert"
      className="border-clay-300 bg-clay-50 text-small text-ink rounded-control border px-4 py-3"
    >
      {children}
    </p>
  );
}

export { WorkspaceEyebrow };
