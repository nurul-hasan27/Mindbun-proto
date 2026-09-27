import { cx } from '../lib/cx';
import { initialsOf } from '../lib/format';

interface MonogramProps {
  readonly name: string;
  className?: string;
}

/**
 * A person's initials, set in the display serif inside a hairline ring.
 *
 * There are no photographs anywhere in this prototype. No real therapist has
 * agreed to have their image used, and a stock portrait would turn a person into
 * a catalogue entry — which is the opposite of what this product is arguing for.
 */
export function Monogram({ name, className }: MonogramProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'border-clay-300 text-clay-700 font-display text-heading flex h-14 w-14 shrink-0 items-center justify-center rounded-full border tracking-[0.02em]',
        className,
      )}
    >
      {initialsOf(name)}
      <span className="sr-only">{name}</span>
    </span>
  );
}
