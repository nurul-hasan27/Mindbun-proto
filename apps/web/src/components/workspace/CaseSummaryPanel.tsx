import { useCallback, useState } from 'react';
import { Button } from '../Button';
import { LoadingNote } from '../LoadingNote';
import { QuietButton } from '../QuietButton';
import { cx } from '../../lib/cx';
import { fetchCaseSummary, type AiCaseSummary } from '../../lib/api/aiWorkspace';
import { toApiError, type ApiError } from '../../lib/api/errors';

/**
 * The AI perspective on a case.
 *
 * ## It is not a chatbot and it is not a section above the evidence
 *
 * No input, no conversation, no floating anything. It is a panel a matcher *asks for*, and
 * it sits beside the evidence rather than above it, because the evidence is what the summary
 * is describing. Put the summary first and a matcher reads the summary instead of the rows,
 * which is precisely the deferral this surface exists to prevent.
 *
 * ## Why it is not loaded automatically
 *
 * Three reasons, and the first is the important one:
 *
 * 1. **It costs a model call.** Requesting one for every matcher looking at every case is a
 *    bill nobody agreed to, spent on a summary most will not read.
 * 2. **It changes how the page is read.** A paragraph that says what matters invites being
 *    read first. Some matchers want that; all of them should choose it.
 * 3. **A failure should not be the first thing on a page.** If the assistant is switched off
 *    or unreachable, the case still needs reviewing, and a red note above the evidence would
 *    be a distraction from the only part of the page that cannot be replaced.
 *
 * ## What it cannot do
 *
 * Nothing here writes. The panel has no controls that touch eligibility, ranking, or the
 * decision — only "write it again" and the note beneath it. The server refuses a summary
 * that mentions anything the case does not contain, so a fabricated reason is a `502` and a
 * sentence, never a plausible lie on a reviewer's screen.
 */

interface CaseSummaryPanelProps {
  /** The case to describe. Nothing else is sent. */
  readonly matchId: string;
  readonly className?: string;
}

type PanelState =
  | { readonly kind: 'unrequested' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly summary: AiCaseSummary }
  | { readonly kind: 'refused'; readonly error: ApiError };

export function CaseSummaryPanel({ matchId, className }: CaseSummaryPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'unrequested' });

  const request = useCallback(() => {
    setState({ kind: 'loading' });

    fetchCaseSummary(matchId).then(
      (summary) => setState({ kind: 'ready', summary }),
      (reason: unknown) => setState({ kind: 'refused', error: toApiError(reason) }),
    );
  }, [matchId]);

  if (state.kind === 'unrequested') {
    return (
      <div className={cx('border-line border-t pt-6', className)}>
        <h2 className="text-label text-ink-muted font-medium uppercase">AI perspective</h2>
        <p className="text-small text-ink-muted max-w-measure mt-3 text-pretty">
          A short read of this case, written from the evidence above. It cannot change anything — it
          is a second reading, not a second opinion with authority.
        </p>
        <p className="mt-4">
          <Button variant="quiet" onClick={request}>
            Write a summary
          </Button>
        </p>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className={cx('border-line border-t pt-6', className)}>
        <h2 className="text-label text-ink-muted font-medium uppercase">AI perspective</h2>
        {/* A `div`, because `LoadingNote` is a `p` and a paragraph cannot contain one. */}
        <div className="mt-4">
          {/* The same quiet line as everywhere else. Not "AI is thinking" — the page has a
              habit of being honest about waiting, and this keeps it. */}
          <LoadingNote>Reading the case.</LoadingNote>
        </div>
      </div>
    );
  }

  if (state.kind === 'refused') {
    return (
      <div className={cx('border-line border-t pt-6', className)}>
        <h2 className="text-label text-ink-muted font-medium uppercase">AI perspective</h2>
        <p className="text-body text-ink max-w-measure mt-3 text-pretty" role="alert">
          {refusalSentence(state.error)}
        </p>
        <p className="text-small text-ink-muted max-w-measure mt-2 text-pretty">
          Everything above this line is unaffected. The case can be reviewed exactly as it stands.
        </p>
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
          <QuietButton onClick={request}>Try again</QuietButton>
          <QuietButton onClick={() => setState({ kind: 'unrequested' })}>Leave it out</QuietButton>
        </p>
      </div>
    );
  }

  return <SummaryBody summary={state.summary} onWriteAgain={request} className={className} />;
}

function SummaryBody({
  summary,
  onWriteAgain,
  className,
}: {
  readonly summary: AiCaseSummary;
  readonly onWriteAgain: () => void;
  readonly className?: string;
}) {
  const { summary: prose, observations, tradeoffs, provider } = summary;

  return (
    <div className={cx('border-line border-t pt-6', className)}>
      <h2 className="text-label text-ink-muted font-medium uppercase">AI perspective</h2>

      <p className="text-body text-ink max-w-measure mt-4 text-pretty">{prose}</p>

      {observations.length > 0 && (
        <section className="mt-8">
          <h3 className="text-label text-ink-faint uppercase">Things worth reviewing</h3>
          {/*
            A list, not a grid of cards. Each line is a hairline-separated note, because these
            are short claims rather than separate facts, and a card each would give five
            assertions the visual weight of five sections.
          */}
          <ul className="border-line divide-line mt-3 divide-y border-y">
            {observations.map((observation) => (
              <li key={observation} className="text-small text-ink py-3 text-pretty">
                {observation}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tradeoffs.length > 0 && (
        <section className="mt-8">
          <h3 className="text-label text-ink-faint uppercase">Tradeoffs</h3>
          <ul className="border-line divide-line mt-3 divide-y border-y">
            {tradeoffs.map((tradeoff) => (
              <li key={tradeoff} className="text-small text-ink py-3 text-pretty">
                {tradeoff}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tradeoffs.length === 0 && observations.length > 0 && (
        <p className="text-small text-ink-faint max-w-measure mt-6 text-pretty">
          No genuine tradeoffs stood out. Where two candidates meet the same conditions equally, the
          evidence is the whole of the difference.
        </p>
      )}

      {/*
        The boundary, said once and plainly. Not a disclaimer paragraph — a matcher should
        not have to read a warning to use a tool — but it has to be *somewhere*, because a
        summary that reads like a finding would otherwise be treated as one.
      */}
      <p className="text-micro text-ink-faint max-w-measure mt-8 text-pretty">
        Written from the stored evidence for this case and checked against it. Review the evidence
        above before deciding — this cannot change scores, eligibility or the decision. Written by{' '}
        {provider}.
      </p>

      <p className="mt-4">
        <QuietButton onClick={onWriteAgain}>Write it again</QuietButton>
      </p>
    </div>
  );
}

/**
 * What a failure says.
 *
 * Each status is a different situation and gets a different sentence, because "something
 * went wrong" on a reviewer's screen sends them looking for a problem that may not exist.
 */
function refusalSentence(error: ApiError): string {
  if (error.status === 502) {
    return 'The summary could not be checked against the case, so it has been left out rather than shown unchecked.';
  }

  if (error.status === 503) {
    return 'The case summary is switched off.';
  }

  if (error.status === 404) {
    return 'That case could not be found.';
  }

  return 'The summary could not be produced.';
}
