import { cx } from '../lib/cx';

interface LoadingNoteProps {
  /** What is being waited for, in the product's own words. */
  readonly children?: string;
  className?: string;
}

/**
 * The loading state for the whole product: one quiet line and a hairline that
 * breathes. No spinners, no skeleton grids, no dots.
 *
 * The motion is a slow opacity fade on a 1px line, which stops entirely under
 * `prefers-reduced-motion` (handled in the stylesheet).
 */
export function LoadingNote({ children = 'Taking a moment…', className }: LoadingNoteProps) {
  return (
    <p className={cx('text-small text-ink-muted flex items-center gap-3', className)}>
      <span className="loading-breathe bg-clay-300 block h-px w-10 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
