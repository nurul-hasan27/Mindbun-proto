import { cx } from '../lib/cx';
import { journey } from '../routes/journey';

interface JourneyIndicatorProps {
  /** Index into `journey`, or -1 when the current page is outside the sequence. */
  readonly currentIndex: number;
}

/**
 * Where you are in the journey, shown as six hairlines.
 *
 * It is a position, not a progress bar: it makes no promise about how far along
 * anyone is, and it is not interactive — the steps that exist yet are reached the
 * ordinary way, by taking the next step. The text alternative carries the same
 * information for anyone who cannot see the marks.
 */
export function JourneyIndicator({ currentIndex }: JourneyIndicatorProps) {
  if (currentIndex < 0) {
    return null;
  }

  const current = journey[currentIndex];

  return (
    <p className="flex items-center gap-3">
      <span className="sr-only">
        {`Step ${currentIndex + 1} of ${journey.length}: ${current?.label ?? ''}`}
      </span>
      <span aria-hidden="true" className="flex items-center gap-1 sm:gap-1.5">
        {journey.map((step, index) => (
          <span
            key={step.id}
            className={cx(
              'block h-px w-3 sm:w-4',
              index < currentIndex && 'bg-clay-200',
              index === currentIndex && 'bg-clay-400',
              index > currentIndex && 'bg-line-strong',
            )}
          />
        ))}
      </span>
    </p>
  );
}
