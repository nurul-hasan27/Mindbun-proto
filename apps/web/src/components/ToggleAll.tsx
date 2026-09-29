import { cx } from '../lib/cx';

interface ToggleAllProps {
  readonly onClick: () => void;
  readonly expanded: boolean;
  readonly label: string;
  /** How many more there are, said in words rather than as a number alone. */
  readonly hiddenCount?: number;
}

/**
 * A plain button that shows or hides a list, in the product's voice.
 *
 * Not a `<details>`: the control has to be able to say "show all 24 languages"
 * rather than "More", and it has to be reachable by name from a screen reader in
 * a sentence about what it will do. `aria-expanded` carries the state.
 */
export function ToggleAll({ onClick, expanded, label, hiddenCount = 0 }: ToggleAllProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cx(
        'link-quiet text-small text-ink ease-gentle hover:text-clay-700 inline-flex cursor-pointer items-center gap-2 font-medium transition-colors duration-200',
      )}
    >
      <span aria-hidden="true" className="ease-gentle transition-transform duration-200">
        {expanded ? '−' : '+'}
      </span>
      {label}
      {!expanded && hiddenCount > 0 && <span className="sr-only">{` (${hiddenCount} more)`}</span>}
    </button>
  );
}
