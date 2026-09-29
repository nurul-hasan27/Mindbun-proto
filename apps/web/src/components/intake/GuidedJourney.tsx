import { JOURNEY_STAGES } from '../../lib/intake/journal';
import { cx } from '../../lib/cx';

/**
 * Where you are, as a place rather than a count.
 *
 * ## Not a counter
 *
 * A conversation counter — "3 of 8 messages" — is the language of a transaction, and it
 * makes the person feel they are working through a queue on someone else's behalf. This is
 * a list of *parts of getting to know somebody*, and only the part they are in is named.
 * The rest are present but quiet, which is what makes it a journey: you can see that there
 * is somewhere to be, without being told how far you have left.
 *
 * The names are the intake's own words, so the conversation and the questions that follow it
 * describe themselves the same way. Nothing on this rail is a step of a wizard either.
 *
 * ## Two arrangements, one meaning
 *
 * A vertical rail with a rule down it on a wide screen, because a vertical sequence is what
 * a journey looks like. Below `lg` it becomes the current stage's name and a row of hairlines
 * — the same arrangement the rest of the product uses for position, so a person who has seen
 * one has seen the other. The desktop rail is hidden rather than reflowed: at narrow widths
 * a sidebar of stage names beside a page of prose is noise competing with the prose.
 */

interface GuidedJourneyProps {
  /** 0-based index into `JOURNEY_STAGES`. */
  readonly current: number;
  readonly variant?: 'rail' | 'row';
  readonly className?: string;
}

export function GuidedJourney({ current, variant = 'rail', className }: GuidedJourneyProps) {
  const stage = JOURNEY_STAGES[Math.min(current, JOURNEY_STAGES.length - 1)] ?? '';
  const reached = (index: number): boolean => index <= current;

  /*
   * What comes next, in words rather than arithmetic.
   *
   * The marks are the position; this sentence is the same position for anyone who cannot see
   * them. Saying "step 2 of 4" would be shorter, and it would also turn the journey into
   * the thing the design is arguing against — a place where you are in a line.
   */
  const ahead =
    current + 1 < JOURNEY_STAGES.length ? `Next: ${JOURNEY_STAGES[current + 1]}.` : 'Last part.';

  if (variant === 'row') {
    return (
      <div className={cx('flex items-center gap-4 sm:gap-6', className)}>
        <p className="text-label text-ink-muted font-medium uppercase">{stage}</p>

        {/*
          Decorative. A person looking at this can see where they are by which mark is
          darker; a person using a screen reader is told the same thing in the sentence
          beside it.

          Named rather than numbered, and for the same reason it is not numbered on screen:
          "step 1 of 4" is a position in a queue, and this is not a queue. The two
          arrangements also have to agree — a component that counted for one and named for
          the other would be describing two different journeys depending on the window.
        */}
        <p aria-hidden="true" className="flex items-center gap-1.5">
          {JOURNEY_STAGES.map((name, index) => (
            <span
              key={name}
              className={cx(
                'ease-gentle block h-px w-4 transition-colors duration-300 sm:w-5',
                index < current && 'bg-clay-200',
                index === current && 'bg-clay-500',
                index > current && 'bg-line-strong',
              )}
            />
          ))}
        </p>

        <p className="sr-only">{ahead}</p>
      </div>
    );
  }

  return (
    <nav aria-label="Where you are" className={cx('lg:sticky lg:top-28', className)}>
      <p className="text-label text-ink-faint font-medium uppercase">Getting to know you</p>

      <ol className="mt-6 flex flex-col">
        {JOURNEY_STAGES.map((name, index) => (
          <li key={name} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cx(
                  'mt-1.5 block h-px w-4 shrink-0 transition-colors duration-300',
                  reached(index) ? 'bg-clay-400' : 'bg-line',
                )}
              />
              {index < JOURNEY_STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'my-1 w-px flex-1 transition-colors duration-300',
                    index < current ? 'bg-clay-200' : 'bg-line',
                  )}
                />
              )}
            </div>

            <p
              className={cx(
                'text-small ease-gentle pb-5 transition-colors duration-300',
                index === current
                  ? 'text-ink font-medium'
                  : index < current
                    ? 'text-ink-muted'
                    : 'text-ink-faint',
              )}
            >
              <span className="text-label tabular-nums opacity-60">
                {String(index + 1).padStart(2, '0')}
                <span className="sr-only">: </span>
              </span>{' '}
              {name}
            </p>
          </li>
        ))}
      </ol>
    </nav>
  );
}
