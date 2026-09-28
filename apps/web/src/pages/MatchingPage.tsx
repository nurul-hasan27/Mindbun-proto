import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { Eyebrow } from '../components/Eyebrow';
import { TextLink } from '../components/TextLink';
import { requestRematch } from '../lib/api/feedback';
import { toApiError, type ApiError } from '../lib/api/errors';
import { isRematch, type RematchRecommendation } from '../lib/api/types';
import { loadMatch, saveMatch, type MatchRecord } from '../lib/intake/session';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

/**
 * Step three of the journey, and the first one that does something.
 *
 * A first match had nowhere to wait, because `/recommendation` asked for it and showed
 * the result in the same place. A rematch is different: the person has just been
 * declined and told we would look again, and a page that flashes and returns would
 * feel like nothing happened. So this step exists, says plainly what it is doing, and
 * is where the honest failures live — the search that found nobody, and the one that
 * could not be reached.
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
  const [state, setState] = useState<State>({ status: 'searching' });

  usePageMeta({
    title: 'Looking again',
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
    if (current === null) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
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
  }, [current, navigate]);

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

  // No match id means no match to look again from, which is the same shape of problem
  // as running out of people: nothing to search, nothing to show.
  if (current === null) {
    return (
      <Frame>
        <Eyebrow>Nothing to look again from</Eyebrow>
        <h1 className="font-display text-title mt-6 text-balance">
          There&rsquo;s no recommendation to look past.
        </h1>
        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
          We would need a recommendation before there is anyone to replace. If you have not reached
          that yet, the questions come first.
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
          <ButtonLink to={paths.recommendation}>Back to {current.therapistName}</ButtonLink>
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
          That is an honest answer rather than a failure. Everyone here has either already been
          shown to you, or does not meet what you marked as important.
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
          <TextLink to={paths.recommendation}>Back to {current.therapistName}</TextLink>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <Eyebrow>Looking again</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">One moment.</h1>

      <p className="loading-breathe bg-clay-300 mt-10 block h-px w-full" aria-hidden="true" />

      <p aria-live="polite" className="text-small text-ink-muted max-w-measure mt-5 text-pretty">
        Looking through the therapists who may fit, using what you told us.
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
