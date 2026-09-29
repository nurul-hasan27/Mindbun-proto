import type { AiSuggestion } from '../../lib/api/ai';
import { isAlreadyApplied } from '../../lib/intake/suggestions';
import type { IntakeDraft } from '../../lib/intake/draft';
import { cx } from '../../lib/cx';

/**
 * What was understood, set as a reading rather than a checklist.
 *
 * ## A card grid here would be the wrong product
 *
 * Each suggestion as a bordered card is the shape of a settings screen: a grid of equal
 * little boxes, each asking to be switched on. What this actually is, is somebody's own
 * sentences read back and offered back to them — so it is set as prose, one per paragraph,
 * with the reasoning directly beneath the thing it reasons about, and the three answers
 * sitting quietly underneath in the voice the product already uses for asking.
 *
 * ## The three answers are peers
 *
 * Keep, change and not quite are set identically and none is selected. A proposal with a
 * default is a decision waiting for a rubber stamp, and the person is the only one who can
 * give it. *Not quite* is a refusal and takes effect at once, with a way back — an
 * irreversible refusal teaches people not to use the button.
 */

export type SuggestionVerdict = 'kept' | 'rejected';

interface ReflectedUnderstandingProps {
  readonly suggestions: readonly AiSuggestion[];
  readonly verdicts: Readonly<Record<string, SuggestionVerdict>>;
  readonly onKeep: (suggestion: AiSuggestion) => void;
  readonly onReject: (suggestion: AiSuggestion) => void;
  readonly onChange: (suggestion: AiSuggestion) => void;
  readonly draft: IntakeDraft;
  readonly className?: string;
}

export function ReflectedUnderstanding({
  suggestions,
  verdicts,
  onKeep,
  onReject,
  onChange,
  draft,
  className,
}: ReflectedUnderstandingProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <ul className={cx('flex flex-col', className)}>
      {suggestions.map((suggestion) => (
        <li
          key={`${suggestion.category}:${suggestion.key}`}
          className="border-line border-t py-7 first:border-t-0 first:pt-0 last:pb-0"
        >
          <Understood
            suggestion={suggestion}
            verdict={verdicts[`${suggestion.category}:${suggestion.key}`]}
            alreadyApplied={isAlreadyApplied(draft, suggestion)}
            onKeep={onKeep}
            onReject={onReject}
            onChange={onChange}
          />
        </li>
      ))}
    </ul>
  );
}

interface UnderstoodProps {
  readonly suggestion: AiSuggestion;
  readonly verdict: SuggestionVerdict | undefined;
  readonly alreadyApplied: boolean;
  readonly onKeep: (suggestion: AiSuggestion) => void;
  readonly onReject: (suggestion: AiSuggestion) => void;
  readonly onChange: (suggestion: AiSuggestion) => void;
}

function Understood({
  suggestion,
  verdict,
  alreadyApplied,
  onKeep,
  onReject,
  onChange,
}: UnderstoodProps) {
  const rejected = verdict === 'rejected';

  return (
    <div className={cx('ease-gentle transition-opacity duration-300', rejected && 'opacity-45')}>
      {/*
        Display face at body size, not heading size. Applying "large when it is the subject
        of the page": the subject here is the person's own words, which are already the
        largest running text above. Five heading-size terms in a column would give the page
        five competing focal points and dilute the one that matters.
      */}
      <p className="font-display text-lead text-ink text-pretty">{suggestion.target.label}</p>

      {/*
        The reasoning sits under the thing it is about, in the quieter face. A suggestion
        with no stated reason is a claim about somebody they cannot check; "you mentioned
        something that sounds like work stress" is a claim about their own sentence, which
        they can.
      */}
      <p className="text-small text-ink-muted mt-2 max-w-[46ch] text-pretty">
        {suggestion.explanation}
      </p>

      {suggestion.confidence !== 'high' && (
        <p className="text-micro text-ink-faint mt-2">
          {suggestion.confidence === 'medium' ? 'A possible reading of that.' : 'Only a guess.'}
        </p>
      )}

      {suggestion.target.kind === 'availabilityHint' && (
        <p className="text-micro text-ink-faint mt-2">
          Offered for the times question, not written in.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {rejected ? (
          <Answer pressed={false} onClick={() => onKeep(suggestion)}>
            Undo
          </Answer>
        ) : (
          <>
            <Answer pressed={verdict === 'kept'} onClick={() => onKeep(suggestion)}>
              {alreadyApplied ? 'Already saved' : 'Keep'}
            </Answer>
            <Answer pressed={false} onClick={() => onChange(suggestion)}>
              Change
            </Answer>
            <Answer pressed={false} onClick={() => onReject(suggestion)}>
              Not quite
            </Answer>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One of the three answers.
 *
 * A real `<button>` with `aria-pressed`, so a kept state is announced rather than inferred
 * from a change in weight, and so the state is never carried by colour alone. The
 * difference between kept and not is an underline and a tone shift — two signals, both of
 * which survive a monochrome screen.
 */
function Answer({
  pressed,
  onClick,
  children,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'link-quiet text-small cursor-pointer font-medium transition-colors duration-200',
        pressed ? 'text-clay-700' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
