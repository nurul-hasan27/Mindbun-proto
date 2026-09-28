import type { AiSuggestion } from '../../lib/api/ai';
import { isAlreadyApplied } from '../../lib/intake/suggestions';
import type { IntakeDraft } from '../../lib/intake/draft';
import { cx } from '../../lib/cx';
import { QuietButton } from '../QuietButton';

/**
 * "Here's what I heard."
 *
 * ## Each suggestion is shown, then judged
 *
 * The wording a person reads is the whole feature. "Work and career may be important" is a
 * claim about them that they cannot check; "you mentioned something that sounds like work
 * stress" is a claim about their sentence that they can. So the explanation is written in
 * second person about what was *said*, and the confidence is shown next to it rather than
 * buried, because a low-confidence guess is worth more to somebody than a confident one is
 * to us.
 *
 * ## Three answers, all equal
 *
 * Keep, not quite, and change are three buttons of the same weight, and none of them is
 * pre-selected. The suggestion list is a proposal, and a proposal with a default is a
 * decision waiting for a rubber stamp.
 *
 * ## Not quite removes; change is for the questions
 *
 * "Not quite" is a refusal and takes effect immediately, because leaving a refused
 * suggestion sitting on screen invites a second reading. "Change" navigates to the question
 * that would adjust it, which is a different act: it says *this is roughly right but wrong
 * here*, and the right place to fix that is where the person chose it.
 */

export type SuggestionVerdict = 'kept' | 'rejected';

interface SuggestionListProps {
  readonly suggestions: readonly AiSuggestion[];
  readonly verdicts: Readonly<Record<string, SuggestionVerdict>>;
  readonly onKeep: (suggestion: AiSuggestion) => void;
  readonly onReject: (suggestion: AiSuggestion) => void;
  readonly onChange: (suggestion: AiSuggestion) => void;
  readonly draft: IntakeDraft;
  readonly className?: string;
}

export function SuggestionList({
  suggestions,
  verdicts,
  onKeep,
  onReject,
  onChange,
  draft,
  className,
}: SuggestionListProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <ul className={cx('border-line divide-line divide-y border-y', className)}>
      {suggestions.map((suggestion) => (
        <li key={`${suggestion.category}:${suggestion.key}`} className="py-6">
          <Suggestion
            suggestion={suggestion}
            verdict={verdicts[`${suggestion.category}:${suggestion.key}`]}
            onKeep={onKeep}
            onReject={onReject}
            onChange={onChange}
            alreadyApplied={isAlreadyApplied(draft, suggestion)}
          />
        </li>
      ))}
    </ul>
  );
}

interface SuggestionProps {
  readonly suggestion: AiSuggestion;
  readonly verdict: SuggestionVerdict | undefined;
  readonly onKeep: (suggestion: AiSuggestion) => void;
  readonly onReject: (suggestion: AiSuggestion) => void;
  readonly onChange: (suggestion: AiSuggestion) => void;
  readonly alreadyApplied: boolean;
}

function Suggestion({
  suggestion,
  verdict,
  onKeep,
  onReject,
  onChange,
  alreadyApplied,
}: SuggestionProps) {
  const rejected = verdict === 'rejected';

  return (
    <div className={cx('transition-opacity duration-200', rejected && 'opacity-45')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/*
          Display serif at body size, not at heading size. The subject of this page is the
          conversation; a suggestion is one line in it. Making these headings would give the
          page three competing focal points and dilute the question underneath.
        */}
        <p className="font-display text-body text-ink">{suggestion.target.label}</p>

        <ConfidenceHint confidence={suggestion.confidence} />
      </div>

      <p className="text-small text-ink-muted mt-2 text-pretty">{suggestion.explanation}</p>

      {suggestion.target.kind === 'availabilityHint' && (
        <p className="text-micro text-ink-faint mt-1">
          Kept as a suggestion for the times question, not written in.
        </p>
      )}

      {/*
        Rejected stays on the page, dimmed, with a way back. A refusal is a decision and
        undoing one is legitimate — a person may change their mind about what they said, and
        an interface that makes that irreversible teaches them not to use the button.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {rejected ? (
          <QuietButton onClick={() => onKeep(suggestion)}>Undo</QuietButton>
        ) : (
          <>
            <Choice pressed={verdict === 'kept'} onClick={() => onKeep(suggestion)}>
              {alreadyApplied ? 'Already saved' : 'Keep'}
            </Choice>
            <Choice pressed={false} onClick={() => onChange(suggestion)}>
              Change
            </Choice>
            <Choice pressed={false} onClick={() => onReject(suggestion)}>
              Not quite
            </Choice>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A keep/change/reject control.
 *
 * A real `<button>` with `aria-pressed`, rather than a styled `<span>`. The state is carried
 * by the underline *and* by `aria-pressed`, so it is not communicated by colour or weight
 * alone — and `aria-pressed` means a screen reader announces the toggle rather than leaving
 * a person to infer it from what changed.
 */
function Choice({
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
        'text-small cursor-pointer font-medium transition-colors duration-200',
        pressed ? 'text-clay-700 underline underline-offset-4' : 'link-quiet text-ink',
        'hover:text-clay-700',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Confidence, in words.
 *
 * "Probably" and "likely" rather than a percentage or a bar. Three levels is what the
 * assistant can actually distinguish, and a fourth would be a number nobody can defend.
 */
function ConfidenceHint({ confidence }: { readonly confidence: AiSuggestion['confidence'] }) {
  if (confidence === 'high') {
    return null;
  }

  return (
    <span className="text-micro text-ink-faint">
      {confidence === 'medium' ? 'a possible read' : 'a long way from certain'}
    </span>
  );
}
