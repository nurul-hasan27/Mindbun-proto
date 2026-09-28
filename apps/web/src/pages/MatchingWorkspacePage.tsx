import { Link } from 'react-router';
import { Container } from '../components/Container';
import { ErrorNote } from '../components/ErrorNote';
import { LoadingNote } from '../components/LoadingNote';
import { CaseRow } from '../components/workspace/CaseRow';
import { fetchCases, type CaseSummary } from '../lib/api';
import { useApiResource } from '../lib/useApiResource';
import { usePageMeta } from '../lib/usePageMeta';
import { workspaceCasePath } from '../routes/paths';

/**
 * The queue.
 *
 * ## The seven questions this page has to make answerable
 *
 * The brief lists them, and they are worth taking as a design brief rather than a checklist,
 * because they are all questions about *this* page: what does the client need (the needs
 * line), why did the system choose this person (the name, and the case page behind it), and
 * what happened before (the search count, when there was more than one).
 *
 * The other four need a case open, which is what the next page is for. What this page must
 * not become is a dashboard: there is no count of anything, no chart, no filter, and no
 * metric. "N clients waiting" is a number about the *system's* workload dressed as
 * information about the work, and it tells a matcher nothing they cannot get by looking.
 */
export function MatchingWorkspacePage() {
  usePageMeta({ title: 'Matching workspace' });

  const { state, retry } = useApiResource<readonly CaseSummary[]>(
    (signal) => fetchCases(undefined, { signal }),
    [],
  );

  return (
    <Container as="section" className="pt-section pb-section">
      <header className="max-w-measure">
        <p className="text-label text-ink-muted font-medium uppercase">Internal</p>
        <h1 className="text-title font-display mt-4">Matching workspace</h1>
        <p className="text-lead text-ink-muted mt-5">
          Cases waiting for a person to look at them. The system has an opinion; you have the final
          say.
        </p>
      </header>

      <div className="mt-14">
        {state.status === 'loading' && <LoadingNote>Loading the cases.</LoadingNote>}

        {state.status === 'error' && <ErrorNote error={state.error} onRetry={retry} />}

        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <EmptyQueue />
          ) : (
            <>
              {/*
                The count is a sentence rather than a headline figure. "2 cases waiting" is
                fine; a large number above a list is a dashboard, and a dashboard is a
                different product.
              */}
              {/*
                An `h2` before a list of `h3` rows. The count is the heading because it is
                genuinely what the section is — and because a list of `h3`s with no `h2`
                above them skips a level, which is the one heading mistake a screen reader
                cannot forgive.
              */}
              <h2 className="text-small text-ink-muted font-normal">
                {state.data.length === 1
                  ? 'One case is waiting.'
                  : `${state.data.length} cases are waiting.`}
              </h2>

              <ul className="border-line mt-6 border-t">
                {state.data.map((entry) => (
                  <CaseRow
                    key={entry.matchId}
                    entry={entry}
                    to={workspaceCasePath(entry.matchId)}
                  />
                ))}
              </ul>
            </>
          ))}
      </div>
    </Container>
  );
}

/**
 * The empty queue.
 *
 * Worth saying something, because "nothing to do" and "something is broken" look identical
 * on a page that only renders a list. This states that the work is genuinely done, and
 * says what would put something here — which is more use to whoever is looking than an
 * empty region.
 */
function EmptyQueue() {
  return (
    <div className="border-line bg-surface-quiet rounded-panel border p-8">
      <p className="text-subheading font-display">Nothing is waiting.</p>
      <p className="text-small text-ink-muted max-w-measure mt-3">
        Every recommendation in the system has been looked at. A new case appears here when a client
        reaches a recommendation nobody has reviewed yet.
      </p>
      <p className="text-small text-ink-muted mt-4">
        <Link to="/" className="link-quiet">
          Back to the site
        </Link>
      </p>
    </div>
  );
}
