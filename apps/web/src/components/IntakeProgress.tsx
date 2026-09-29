import { cx } from '../lib/cx';

interface IntakeProgressProps {
  /** 1-based position in the flow. The review screen is the last position. */
  readonly current: number;
  /** Total positions, including the review screen. */
  readonly total: number;
  /** The plain name of the question on screen, for the text alternative. */
  readonly question: string;
}

/**
 * Where you are, said quietly.
 *
 * The label names the *part of the flow* — "Getting to know what matters" — and
 * not the question, because the question is already the largest thing on the page
 * directly underneath. Repeating it in small capitals above itself would be noise
 * wearing the same words twice.
 *
 * The row of hairlines is the same mark language as the journey indicator, and it
 * is why someone can see that this ends. The count is in the text alternative
 * rather than on screen: a person looking at this can count the marks, and a
 * person using a screen reader can be told exactly where they are.
 */
export function IntakeProgress({ current, total, question }: IntakeProgressProps) {
  const atReview = current === total;

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <p className="text-label text-ink-muted font-medium uppercase">
        {atReview ? 'Before you finish' : 'Getting to know what matters'}
        <span className="sr-only">{`. Step ${current} of ${total}: ${question}`}</span>
      </p>

      <p aria-hidden="true" className="flex items-center gap-1 sm:gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cx(
              'ease-gentle block h-px w-3 transition-colors duration-300 sm:w-4',
              index < current - 1 && 'bg-clay-200',
              index === current - 1 && 'bg-clay-400',
              index > current - 1 && 'bg-line-strong',
            )}
          />
        ))}
      </p>
    </div>
  );
}
