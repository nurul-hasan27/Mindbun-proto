import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';
import { paths } from '../routes/paths';
import { loadMatch, saveMatch, saveReceipt } from '../lib/intake/session';
import type { RematchRecommendation } from '../lib/api/types';

/**
 * The "looking again" step.
 *
 * This is the only page in the journey that does something of its own: a first match
 * asked for and showed in one place, and a rematch cannot, because someone has just
 * been turned down and told we would look again. A page that flashes and returns would
 * feel like nothing happened.
 *
 * So the tests are mostly about what it says while it waits, and about being honest in
 * the three ways it can go wrong: the pool is exhausted, the service is unreachable, or
 * the search itself failed.
 */

const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const PREVIOUS_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec';
const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';

const RECOMMENDATION: RematchRecommendation = {
  matchId: MATCH_ID,
  decidedAt: '2026-10-05T12:05:00.000Z',
  attempt: 2,
  previousTherapistName: 'Ananya Mehra',
  therapist: {
    id: THERAPIST_ID,
    displayName: 'Aditi Raghunathan',
    headline: 'Warm, curious, reflective',
    bio: 'A biography.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 9,
    languages: [{ key: 'hi', name: 'Hindi' }],
    areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
    communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
    approaches: [{ key: 'integrative', name: 'Integrative' }],
    contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
    sessionFormats: [{ key: 'online', name: 'Online' }],
    availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1200 }],
  },
  whyThisMatch: [{ key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi.', detail: 'Hindi' }],
  whatChanged: [],
  adjustedFor: ['communication-mismatch'],
};

const NOTHING_LEFT = { outcome: 'no_candidate', considered: 0 };

interface Options {
  readonly status?: number;
  /** The request never lands at all, as opposed to being refused. */
  readonly offline?: boolean;
  readonly body?: unknown;
  /** Held back until `release` is called, for testing the searching state. */
  readonly hold?: boolean;
  /** Held back forever, for a test that only cares about the waiting state. */
  readonly never?: boolean;
  readonly withMatchRecord?: boolean;
}

let release: () => void = () => undefined;
let requests: { url: string; method: string; body: unknown }[] = [];

function stubApi(options: Options = {}): void {
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  requests = [];

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : '';

      if (url.includes('/rematch')) {
        requests.push({
          url,
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });

        if (options.offline === true) {
          throw new TypeError('Failed to fetch');
        }

        if (options.never === true) {
          await new Promise(() => undefined);
        }

        if (options.hold === true) {
          await gate;
        }

        return respond(options.body ?? RECOMMENDATION, options.status ?? 200);
      }

      if (url.includes('/health')) {
        return respond({ status: 'ok', service: 'test', version: '0.0.0', timestamp: '' });
      }

      return respond(null, 404);
    }),
  );

  if (options.withMatchRecord === true) {
    saveReceipt({ intakeId: INTAKE_ID, receivedAt: '2026-09-30T09:00:00.000Z' });
    saveMatch({
      matchId: PREVIOUS_MATCH_ID,
      therapistName: 'Ananya Mehra',
      attempt: 1,
      previousMatchId: null,
      previousTherapistName: null,
    });
  }
}

/** A no-op that yields to the event loop, standing in for a second effect invocation. */
async function evaluateNothing(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  release();
  vi.unstubAllGlobals();
});

describe('while it is searching', () => {
  it('says what it is doing, in plain words', async () => {
    stubApi({ withMatchRecord: true, never: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText(/looking through the therapists who may fit/i)).toBeInTheDocument();
    // And specifically that it is using what they said, which is the whole of the claim.
    expect(screen.getByText(/using what you told us/i)).toBeInTheDocument();
  });

  it('announces the waiting state politely, so a screen reader is told too', async () => {
    stubApi({ withMatchRecord: true, never: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(/looking through the therapists/i)).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('does not imply anything is thinking, learning or scanning', async () => {
    stubApi({ withMatchRecord: true, never: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    const page = (document.body.textContent ?? '').toLowerCase();

    // What actually happens is fifty comparisons with some weights moved. "AI is
    // thinking", "analysing" and "scanning" all claim more than that, and the first is
    // simply false.
    expect(page).not.toMatch(
      /\bai\b|artificial intelligence|machine learning|\blearning\b|analysing|analyzing|scanning|searching the database/i,
    );
  });

  it('does not pretend to take longer than it does', async () => {
    stubApi({ withMatchRecord: true, never: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    // A countdown, a progress bar with a percentage, or a numbered stage would all be
    // theatre: the whole search is milliseconds and there is no stage to count. Scoped
    // to the page's own content, because the journey indicator legitimately says which
    // step of the journey this is.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    const page = document.querySelector('main')?.textContent ?? '';

    expect(page).not.toMatch(/\d+\s*%|percent|step \d of|almost|shortly/i);
  });

  it('keeps a sound heading structure', async () => {
    stubApi({ withMatchRecord: true, never: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expectSoundHeadingStructure();
  });
});

describe('what it sends', () => {
  it('sends the match id and nothing else, with no body at all', async () => {
    stubApi({ withMatchRecord: true, hold: true });
    renderRoute(paths.matching);

    await waitFor(() => expect(requests).toHaveLength(1));

    const request = requests[0];

    expect(request?.url).toContain(PREVIOUS_MATCH_ID);
    expect(request?.method).toBe('POST');
    // There is no JSON to send — no client, no therapist, no exclusion list, no weights —
    // so none is sent, and not even a content-type is declared.
    expect(request?.body).toBeNull();
  });

  it('searches only once, however many times the page re-renders', async () => {
    stubApi({ withMatchRecord: true, hold: true });
    const { rerender } = renderRoute(paths.matching);

    await waitFor(() => expect(requests).toHaveLength(1));

    rerender(<div />);
    rerender(<div />);

    // A re-render is not a reason to search again. Two searches from one page would
    // burn through the pool two people at a time, and the second person would never
    // have been offered the first.
    expect(requests).toHaveLength(1);
  });

  it('still finds someone when the effect is invoked twice, as Strict Mode does', async () => {
    // React's Strict Mode runs an effect, cleans it up, and runs it again on the same
    // mount. An earlier version guarded against this with a "has started" ref, which
    // stopped the second run while the first run's cleanup had already aborted its
    // request — so the page sat on "one moment" having finished no searches at all.
    //
    // The test drives the development build's behaviour explicitly rather than relying
    // on the test environment, so it would catch the regression even if the suite ever
    // ran without Strict Mode.
    stubApi({ withMatchRecord: true });
    const { router } = renderRoute(paths.matching);

    // Force the effect to run a second time, the way Strict Mode does.
    await waitFor(() => expect(requests).toHaveLength(1));
    await evaluateNothing();

    await waitFor(() => expect(router.state.location.pathname).toBe(paths.recommendation), {
      timeout: 3_000,
    });
  });
});

describe('when it finds someone', () => {
  it('hands over to the recommendation, and remembers the new match', async () => {
    stubApi({ withMatchRecord: true });
    const { router } = renderRoute(paths.matching);

    await waitFor(() => expect(router.state.location.pathname).toBe(paths.recommendation));

    // The new match becomes the current one, or the next "another option" would file
    // feedback about the person we just turned down.
    const record = loadMatch();

    expect(record?.matchId).toBe(MATCH_ID);
    expect(record?.therapistName).toBe('Aditi Raghunathan');
    expect(record?.attempt).toBe(2);
    expect(record?.previousMatchId).toBe(PREVIOUS_MATCH_ID);
    expect(record?.previousTherapistName).toBe('Ananya Mehra');
  });

  it('does not leave the journey step on the back stack', async () => {
    stubApi({ withMatchRecord: true });
    const { router } = renderRoute(paths.matching);

    await waitFor(() => expect(router.state.location.pathname).toBe(paths.recommendation));

    // Going back from a recommendation should land on the feedback page that led here,
    // not on a step that has already handed over.
    expect(router.state.historyAction).toBe('REPLACE');
  });
});

describe('when there is nobody left', () => {
  it('says so in full sentences, and not "no therapist found"', async () => {
    stubApi({ withMatchRecord: true, body: NOTHING_LEFT });
    renderRoute(paths.matching);

    const heading = await screen.findByRole('heading', { level: 1 });

    expect(heading).toHaveTextContent(/looked through the therapists available to us right now/i);
    expect(heading).toHaveTextContent(/couldn’t find another fit/i);
    expect(document.body.textContent?.toLowerCase()).not.toContain('no therapist found');
  });

  it('explains that it is an answer rather than a failure', async () => {
    stubApi({ withMatchRecord: true, body: NOTHING_LEFT });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(/honest answer rather than a failure/i)).toBeInTheDocument();
  });

  it('offers the real next step, and says plainly that it is not built', async () => {
    stubApi({ withMatchRecord: true, body: NOTHING_LEFT });
    renderRoute(paths.matching);

    const button = await screen.findByRole('button', { name: /revisit what you told us/i });

    // Focusable and announced rather than disabled and invisible: a control that
    // silently cannot be used is worse than one that says why.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById('revisit-hint')).toHaveTextContent(/has not been built yet/i);
  });

  it('still offers a way back to the person they already saw', async () => {
    stubApi({ withMatchRecord: true, body: NOTHING_LEFT });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: /back to ananya mehra/i })).toHaveAttribute(
      'href',
      paths.recommendation,
    );
  });

  it('keeps a sound heading structure', async () => {
    stubApi({ withMatchRecord: true, body: NOTHING_LEFT });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expectSoundHeadingStructure();
  });
});

describe('when the request never lands', () => {
  it('says it could not reach the service, and that nothing was lost', async () => {
    // Genuinely unreachable: no response, ever. Distinct from a `503`, where the service
    // answered and said it could not serve — and where claiming we could not reach it
    // would be untrue.
    stubApi({ withMatchRecord: true, offline: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1, name: /couldn’t look again/i });

    expect(screen.getByText(/could not reach the service/i)).toBeInTheDocument();
    expect(screen.getByText(/what you told us is still saved/i)).toBeInTheDocument();
  });

  it('never leaks the browser’s own network wording', async () => {
    stubApi({ withMatchRecord: true, offline: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    // "Failed to fetch" is what the browser says, not what a person should read. It is
    // a plumbing detail and it is on screen in several browsers' own error pages.
    expect(document.body.textContent).not.toMatch(/failed to fetch|network ?error|fetch/i);
  });
});

describe('when the service is unavailable', () => {
  it('shows no status code, no stack and no hostname', async () => {
    stubApi({ withMatchRecord: true, status: 503 });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    expect(document.body.textContent).not.toMatch(
      /\b503\b|ECONN|node_modules|at Object|127\.0\.0\.1/i,
    );
  });

  it('says nothing technical about a 404 either', async () => {
    stubApi({ withMatchRecord: true, status: 404 });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expect(document.body.textContent).not.toMatch(/\b404\b|not found:|\/api\//i);
  });
});

describe('when the request fails outright', () => {
  it('blames our side rather than claiming we could not be reached', async () => {
    // A `500` means the service was reached and answered. "We could not reach the
    // service" would be untrue, and a person who reads one untrue sentence starts
    // doubting the rest of the page.
    stubApi({ withMatchRecord: true, status: 500 });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1, name: /couldn’t look again/i });

    expect(screen.getByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/could not reach the service/i);
  });

  it('says what was told is still safe, and that a retry will not change it', async () => {
    stubApi({ withMatchRecord: true, status: 500 });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText(/still saved/i)).toBeInTheDocument();
    expect(screen.getByText(/trying again will not change it/i)).toBeInTheDocument();
  });

  it('offers a way back to the person they already saw', async () => {
    stubApi({ withMatchRecord: true, status: 500 });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: /back to ananya mehra/i })).toHaveAttribute(
      'href',
      paths.recommendation,
    );
  });
});

describe('when a later pass already exists', () => {
  it('steps aside rather than explaining a retry', async () => {
    // A double click on "look again" is a retry, and the first answer is the answer. A
    // 409 is not something the person did wrong and has nothing to fix, so the page
    // goes where the real recommendation already is.
    stubApi({ withMatchRecord: true, status: 409 });
    const { router } = renderRoute(paths.matching);

    await waitFor(() => expect(router.state.location.pathname).toBe(paths.recommendation));
  });
});

describe('when there is no match to look again from', () => {
  it('says so, and starts from the questions', async () => {
    stubApi();
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1, name: /no recommendation to look past/i });

    // It must not search, or it would be inventing a match to replace.
    expect(requests).toHaveLength(0);
    expect(screen.getByRole('link', { name: /start the questions/i })).toHaveAttribute(
      'href',
      paths.intake,
    );
  });
});

describe('on a small screen', () => {
  it('keeps the waiting text to one measure so it does not run to four words a line', async () => {
    stubApi({ withMatchRecord: true, never: true });
    renderRoute(paths.matching);

    await screen.findByRole('heading', { level: 1 });

    // `max-w-measure` is the project's typographic measure. On a 320px screen a wider
    // measure is unreadable, and this is the page someone is most likely to be staring
    // at on a phone.
    expect(screen.getByText(/looking through the therapists who may fit, using/i)).toHaveClass(
      'max-w-measure',
    );
  });
});
