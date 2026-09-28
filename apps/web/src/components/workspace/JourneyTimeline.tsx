import type { JourneyStep } from '../../lib/api/workspace';
import { cx } from '../../lib/cx';
import { WorkspaceEyebrow } from './WorkspaceColumns';

/**
 * The journey, as a quiet timeline.
 *
 * ## What this is for
 *
 * Auditability. Somebody reading this later needs to answer "what happened, in what order,
 * and who decided" — and nothing more. It is not a narrative and it is not a story, so
 * there is no connector line, no arrow glyph and no animation. A timeline that looks like a
 * process diagram turns a record into a claim about a process, and this record is a set of
 * facts that happened to occur in an order.
 *
 * The order is real and it is the point: pass 1, what the client said about it, pass 2, what
 * was suggested, what the matcher decided. Each row is a fact with an attempt number on it.
 */
interface JourneyTimelineProps {
  readonly steps: readonly JourneyStep[];
  /** Reason keys by key, for turning the client's feedback into words. */
  readonly feedbackNames: Readonly<Record<string, string>>;
  /** The case being reviewed, so the current pass can be named rather than inferred. */
  readonly currentMatchId: string;
}

export function JourneyTimeline({ steps, feedbackNames, currentMatchId }: JourneyTimelineProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ol className="flex flex-col">
      {steps.map((step) => {
        const isCurrent = step.matchId === currentMatchId;

        return (
          <li
            key={step.matchId}
            className={cx(
              'border-line relative border-l py-5 pl-6',
              isCurrent && 'border-clay-300',
            )}
          >
            {/*
              The marker is a dot rather than a number. The number is already in the row's
              own text ("Search 1"), and a numbered marker duplicates it in a place a
              screen reader has to announce separately.
            */}
            <span
              aria-hidden="true"
              className={cx(
                'absolute top-7 -left-[0.3rem] h-2 w-2 rounded-full',
                isCurrent ? 'bg-clay-700' : 'bg-line-strong',
              )}
            />

            <p className="text-label text-ink-muted font-medium uppercase">
              {step.attempt === 1 ? 'First search' : `Search ${step.attempt}`}
              {isCurrent && <span className="text-clay-700"> · this case</span>}
            </p>

            <p className="text-body text-ink mt-2">
              The system suggested {step.systemSuggestedName}.
            </p>

            {step.clientFeedback.length > 0 && (
              <p className="text-small text-ink-muted mt-2">
                <span className="text-ink">The client said it didn’t fit: </span>
                {step.clientFeedback.map((key) => feedbackNames[key] ?? key).join(', ')}.
              </p>
            )}

            {step.decision !== null && (
              <div className="border-clay-200 mt-4 border-l-2 pl-4">
                <p className="text-small text-ink">
                  {step.decision.decisionType === 'SYSTEM_ACCEPTED'
                    ? 'The matcher agreed with the system.'
                    : `The matcher chose ${step.selectedName ?? 'someone else'}.`}
                </p>
                {step.decision.reasonKeys.length > 0 && (
                  <p className="text-small text-ink-muted mt-1">
                    Reason: {step.decision.reasonKeys.map(phrase).join(', ')}.
                  </p>
                )}
                {step.decision.note !== null && (
                  <p className="text-small text-ink-muted mt-1 italic">“{step.decision.note}”</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A reason key in a sentence.
 *
 * The decision response carries keys, not names, so the audit trail is stable when a
 * copywriter rewrites a sentence. Rendering them here turns a key back into something
 * readable, falling back to the key itself if the vocabulary has moved on — a slightly odd
 * word beats a blank.
 */
function phrase(key: string): string {
  return key.replaceAll('-', ' ');
}

export { WorkspaceEyebrow };
