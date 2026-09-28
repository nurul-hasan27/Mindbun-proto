import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { Eyebrow } from '../components/Eyebrow';
import { TextLink } from '../components/TextLink';
import { requestRematch } from '../lib/api/feedback';
import { toApiError, type ApiError } from '../lib/api/errors';
import { requestMatch } from '../lib/api/matches';
import { isRematch, type RematchRecommendation } from '../lib/api/types';
import { loadMatch, loadReceipt, saveMatch, type MatchRecord } from '../lib/intake/session';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

/**
 * Step three of the journey, and the first one that does something.
 *
 * ## Why a first match comes through here too
 *
 * It used not to. `/recommendation` asked for the first match and showed the result in the
 * same place, so this step was only reached on a rematch — and the journey indicator, which
 * lists six steps, went from *the questions* straight to *the recommendation* on a first
 * pass. The promise was in the header; the step was not.
 *
 * That is the kind of small inconsistency a person notices without being able to name it:
 * something is being skipped, and nothing says why. The journey is a description of what
 * happens, and it should not describe a step that does not.
 *
 * So the first search now comes through here as well, and the page says the same honest
 * thing in both cases: *we are looking through the therapists who may fit, using what you
 * told us.* A rematch adds one clause — that we are leaving past the person you just turned
 * down — because that is true and worth saying.
 *
 * What this page must never become is theatre. The search takes milliseconds, and a spinner
 * longer than that would be a lie about work being done. It says what it is doing, and then
 * it is gone.
 *
 * ## What it says, and does not say
 *
 * "Looking again" is accurate. "Finding you the perfect match" would not be: what
 * happens is fifty comparisons with some weights moved by what you said. No
 * implication of intelligence, no implication that anything was learnt, and no
 * manufactured delay — the whole search is milliseconds, and a spinner longer than that
 * would be theatre.
 */
type State =
  | { readonly status: 'searching' }
  | { readonly status: 'found'; readonly match: RematchRecommendation }
  | { readonly status: 'exhausted' }
  /**
   * The search did not happen, or could not be read.
   *
   * One state with a message chosen from the failure, rather than a state per status.
   * Every branch of this page is somewhere a person reads, and four near-identical
   * error pages is four chances for two of them to say something subtly untrue. What
   * they have in common is the part that matters: what they said is safe, and they can
   * go back to the person they already saw.
   */
  | { readonly status: 'failed'; readonly message: string };

export function MatchingPage() {
  const navigate = useNavigate();
  const [current] = useState(loadMatch);
  const [receipt] = useState(loadReceipt);
  const [state, setState] = useState<State>({ status: 'searching' });

  /**
   * A first search has nobody to look past; a rematch does.
   *
   * One page, two honest jobs. The word "again" only appears when it is true, because a
   * person who is told they are being shown someone again when they have not seen anyone
   * yet has been told something false about their own position in the process.
   */
  const isFirstSearch = current === null;

  usePageMeta({
    title: isFirstSearch ? 'Finding a fit' : 'Looking again',
    description: 'Looking through the therapists who may fit what you told us.',
  });

  useEffect(() => {
    // No "has this run" guard, and that is deliberate.
    //
    // An earlier version had one, on the reasoning that it would prevent a second
    // search. It did the opposite: under React's Strict Mode the effect is invoked,
    // cleaned up and invoked again on the same mount, so the guard stopped the second
    // run while the first one's cleanup had already aborted its request. The page sat
    // on "one moment" forever, having started exactly zero searches that finished.
    //
    // Running the effect freely is the correct pattern, and the duplicate it permits in
    // development is safe at every layer below: the server treats a second request for
    // the same match as a retry and answers with a pointer to the pass that already
    // exists, and the page follows it. A guard that makes the page hang is a much worse
    // trade than a request that is refused rather than duplicated.
    const controller = new AbortController();

    void (async () => {
      try {
        if (current === null) {
          // A first search. There is no match to look past, so there is nothing to
          // compare against and nothing to remember — the record it writes is the
          // simplest one the type allows, and "what changed" on a first match is
          // correctly empty because nothing has changed yet.
          if (receipt === null) {
            return;
          }

          const outcome = await requestMatch(receipt.intakeId, undefined, {
            signal: controller.signal,
          });

          if (!('therapist' in outcome)) {
            // Nobody in the pool meets what was marked as important. The same honest
            // answer the rematch gives, reached on the first pass.
            setState({ status: 'exhausted' });
            return;
          }

          saveMatch({
            matchId: outcome.matchId,
            therapistName: outcome.therapist.displayName,
            attempt: outcome.attempt,
            previousMatchId: null,
            previousTherapistName: null,
          });
          setState({ status: 'found', match: outcome });
          return;
        }

        const outcome = await requestRematch(current.matchId, undefined, {
          signal: controller.signal,
        });

        if (!isRematch(outcome)) {
          setState({ status: 'exhausted' });
          return;
        }

        // The new recommendation becomes the current one, and remembers the one it
        // replaced. That is the whole of the history this tab holds — enough for "what
        // changed" to have something to compare against, and no more than the person
        // already saw.
        const record: MatchRecord = {
          matchId: outcome.matchId,
          therapistName: outcome.therapist.displayName,
          attempt: outcome.attempt,
          previousMatchId: current.matchId,
          previousTherapistName: outcome.previousTherapistName,
        };

        saveMatch(record);
        setState({ status: 'found', match: outcome });
      } catch (error) {
        // An abort is this page leaving, not a failure. Nothing to say about it.
        if (controller.signal.aborted) {
          return;
        }

        const failure = toApiError(error);

        // A 409 means a later pass already exists, which is a retry rather than a
        // failure. There is nothing to fix and nothing to explain, so the page simply
        // steps aside.
        if (failure.kind === 'http' && failure.status === 409) {
          void navigate(paths.recommendation, { replace: true });
          return;
        }

        setState({ status: 'failed', message: whatWentWrong(failure) });
      }
    })();

    return () => controller.abort();
  }, [current, navigate, receipt]);

  // Straight on once there is something to show, as an effect rather than during
  // render: navigating *is* a side effect, and doing it in a render body would fire it
  // twice under Strict Mode and make the page's behaviour depend on the renderer.
  useEffect(() => {
    if (state.status === 'found') {
      void navigate(paths.recommendation, { replace: true });
    }
  }, [navigate, state]);

  // Once there is a result to hand over, this step's job is done and the
  // recommendation is on its way. The frame stays empty rather than flashing a stale
  // "one moment".
  if (state.status === 'found') {
    return <Frame />;
  }

  // Neither a match to look past nor an intake to search: this tab has nothing stored,
  // which is the same shape of problem as running out of people. Nothing to search,
  // nothing to show.
  if (current === null && receipt === null) {
    return (
      <Frame>
        <Eyebrow>Nothing to look for yet</Eyebrow>
        <h1 className="font-display text-title mt-6 text-balance">
          There&rsquo;s nothing here to search yet.
        </h1>
        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
          We look once there is either a recommendation to look past, or answers of yours to look
          through. The questions come first.
        </p>
        <div className="mt-10 flex flex-col items-start gap-5">
          <ButtonLink to={paths.intake}>Start the questions</ButtonLink>
          <TextLink to={paths.home}>Back to the beginning</TextLink>
        </div>
      </Frame>
    );
  }

  if (state.status === 'failed') {
    return (
      <Frame>
        <Eyebrow>Not this time</Eyebrow>
        <h1 className="font-display text-title mt-6 text-balance">
          We couldn&rsquo;t look again just now.
        </h1>
        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">{state.message}</p>
        <div className="mt-10 flex flex-col items-start gap-5">
          {current !== null && (
            <ButtonLink to={paths.recommendation}>Back to {current.therapistName}</ButtonLink>
          )}
        </div>
      </Frame>
    );
  }

  if (state.status === 'exhausted') {
    return (
      <Frame>
        <Eyebrow>Nobody left</Eyebrow>

        <h1 className="font-display text-title mt-6 text-balance">
          We&rsquo;ve looked through the therapists available to us right now, but couldn&rsquo;t
          find another fit based on what you&rsquo;ve told us.
        </h1>

        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
          {current === null ? (
            <>
              That is an honest answer rather than a failure. Everyone here either does not meet
              what you marked as important, or works in a way that did not match what you asked for.
            </>
          ) : (
            <>
              That is an honest answer rather than a failure. Everyone here has either already been
              shown to you, or does not meet what you marked as important.
            </>
          )}
        </p>

        <div className="mt-10 flex flex-col items-start gap-6">
          {/* The real next step, and the one this phase cannot take. Loosening a
              requirement and searching again is real work on the matching side, so the
              control is present, focusable, and says so. */}
          <Button unavailable unavailableHint="revisit-hint" variant="quiet">
            Revisit what you told us
          </Button>
          <p id="revisit-hint" className="text-small text-ink-faint max-w-sm text-pretty">
            Going back to change your answers and searching again is the next part of this
            prototype, and it has not been built yet.
          </p>
          {current !== null && (
            <TextLink to={paths.recommendation}>Back to {current.therapistName}</TextLink>
          )}
          {current === null && <TextLink to={paths.intake}>Back to your answers</TextLink>}
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <Eyebrow>{current === null ? 'Finding a fit' : 'Looking again'}</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">One moment.</h1>

      <p className="loading-breathe bg-clay-300 mt-10 block h-px w-full" aria-hidden="true" />

      <p aria-live="polite" className="text-small text-ink-muted max-w-measure mt-5 text-pretty">
        {current === null ? (
          <>
            Looking through the therapists who may fit, using what you told us. We read what each of
            them has said about their own work, so the reasons can be shown to you rather than
            summarised.
          </>
        ) : (
          <>
            Looking through the therapists who may fit, leaving past {current.therapistName} and
            using what you told us.
          </>
        )}
      </p>
    </Frame>
  );
}

/**
 * What to say about a failure, in one place.
 *
 * The distinctions are narrow but real. "We could not reach the service" is untrue for a
 * `500` — the service was reached and answered — and a person who sees a message that
 * does not describe what happened stops trusting the other ones. A `404` is different
 * again: there is nothing to compare against, which is a different thing from a
 * failure and does not need apologising for.
 *
 * None of these mention a status, and none blame the person for triggering them.
 */
function whatWentWrong(failure: ApiError): string {
  if (failure.status === 404) {
    return 'We no longer have that one to compare against. The recommendation you saw is still on the next page.';
  }

  if (failure.kind === 'network' || failure.kind === 'timeout' || failure.kind === 'config') {
    return 'We could not reach the service just now. What you told us is still saved, and trying again will not change it.';
  }

  if (failure.kind === 'parse') {
    return 'Something came back from the service that we could not read. What you told us is still saved.';
  }

  return 'Something went wrong on our side. What you told us is still saved, and trying again will not change it.';
}

function Frame({ children }: { readonly children?: React.ReactNode }) {
  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">{children}</div>
    </Container>
  );
}
