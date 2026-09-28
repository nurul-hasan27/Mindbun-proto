import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';
import { paths, therapistPath } from '../routes/paths';
import { saveReceipt } from '../lib/intake/session';
import type { MatchRecommendation, NoCandidateOutcome } from '../lib/api/types';

const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';

const RECOMMENDATION: MatchRecommendation = {
  matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec',
  decidedAt: '2026-09-30T09:00:00.000Z',
  therapist: {
    id: THERAPIST_ID,
    displayName: 'Ananya Mehra',
    headline: 'Warm, curious, reflective',
    bio: 'I tend to work slowly and notice what gets left unsaid.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 8,
    languages: [
      { key: 'en', name: 'English' },
      { key: 'hi', name: 'Hindi' },
    ],
    areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
    communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
    approaches: [{ key: 'integrative', name: 'Integrative' }],
    contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
    sessionFormats: [{ key: 'online', name: 'Online' }],
    availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1200 }],
  },
  whyThisMatch: [
    {
      key: 'REQUIRED_LANGUAGE',
      sentence: 'They speak Hindi, one of the languages you chose.',
      detail: 'Hindi',
    },
    {
      key: 'AVAILABILITY_OVERLAP',
      sentence: 'You are both free on Tuesday 18:00–20:00 your time.',
      detail: 'Tuesday 18:00–20:00',
    },
    {
      key: 'CONTEXTUAL_EXPERIENCE',
      sentence: 'They have direct experience with the Indian diaspora.',
      detail: 'the Indian diaspora',
    },
  ],
};

const NOTHING_QUALIFIED: NoCandidateOutcome = { outcome: 'no_candidate', considered: 50 };

interface Stub {
  readonly matchStatus: number;
  readonly body: unknown;
  readonly hold: boolean;
  readonly requests: { url: string; body: unknown }[];
}

interface StubOptions {
  readonly body?: unknown;
  readonly status?: number;
  /** Held back until `release` is called, for testing the finding state. */
  readonly hold?: boolean;
}

let stub: Stub;

/** Releases a held request, for tests that need the finding state to end. */
let releaseHeld: () => void = () => undefined;

function stubMatch(options: StubOptions = {}): void {
  const gate = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });

  stub = {
    matchStatus: options.status ?? 200,
    body: options.body ?? RECOMMENDATION,
    hold: options.hold ?? false,
    requests: [],
  };

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : '';

      if (init?.method === 'POST' && url.includes('/matches')) {
        stub.requests.push({
          url,
          body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
        });

        if (stub.hold) {
          await gate;
        }

        return respond(stub.body, stub.matchStatus);
      }

      if (url.includes('/api/v1/health')) {
        return respond({ status: 'ok', service: 'test', version: '0.0.0', timestamp: '' });
      }

      if (url.includes(`/therapists/${THERAPIST_ID}`)) {
        return respond(RECOMMENDATION.therapist);
      }

      return respond(null, 404);
    }),
  );
}

function withReceipt(): void {
  saveReceipt({ intakeId: INTAKE_ID, receivedAt: '2026-09-30T09:00:00.000Z' });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  releaseHeld();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a recommendation', () => {
  it('says the transition from the intake out loud', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /someone we think you might connect with/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('You shared what matters')).toBeInTheDocument();
  });

  it('introduces the person by name', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/warm, curious, reflective/i)).toBeInTheDocument();
    expect(screen.getByText(/bengaluru, india · 8 years in practice/i)).toBeInTheDocument();
  });

  it('reuses the profile page’s sections rather than inventing new ones', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    for (const label of ['Works with', 'How they show up', 'Languages', 'Sessions']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    }
  });

  it('links to the full profile', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    const link = await screen.findByRole('link', { name: /read more about ananya/i });

    expect(link).toHaveAttribute('href', therapistPath(THERAPIST_ID));
  });

  it('sends the intake reference and nothing else', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.body).toEqual({ intakeId: INTAKE_ID });
  });

  it('keeps a sound heading structure', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });
    expectSoundHeadingStructure();
  });
});

describe('why this match', () => {
  it('is the element with the reasons in it', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    const section = screen.getByRole('region', { name: /why we thought you might connect/i });

    expect(
      within(section).getByText(RECOMMENDATION.whyThisMatch[0]?.sentence ?? ''),
    ).toBeInTheDocument();
  });

  it('shows every reason the service sent, as its own sentence', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    const section = await screen.findByRole('region', { name: /why we thought/i });
    const list = within(section).getByRole('list');

    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('introduces the person briefly before asking why', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    const page = document.body.textContent ?? '';
    const name = page.indexOf('Ananya Mehra');
    const bio = page.indexOf('I tend to work slowly');
    const reasons = page.indexOf('Why we thought you might connect');

    expect(name).toBeGreaterThan(-1);
    expect(bio).toBeGreaterThan(-1);
    expect(reasons).toBeGreaterThan(-1);

    // A short introduction, then the reasons: reasons about a stranger are not
    // readable, so who it is comes first and why immediately after.
    expect(name).toBeLessThan(bio);
    expect(bio).toBeLessThan(reasons);
  });

  it('shows no reasons at all rather than inventing some', async () => {
    stubMatch({ body: { ...RECOMMENDATION, whyThisMatch: [] } });
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    expect(screen.queryByRole('region', { name: /why we thought/i })).not.toBeInTheDocument();
  });
});

describe('never sounding like a marketplace', () => {
  it('shows no number, score, percentage, or rank anywhere on the page', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    const page = document.body.textContent ?? '';

    expect(page).not.toMatch(/\d+\s*%/);
    expect(page).not.toMatch(/\b\d+\s*(?:out of|\/\s*\d+)\b/);
    expect(page.toLowerCase()).not.toMatch(
      /\b(score|scored|rank|ranking|percent|match percentage|best match|top therapist|number one|#1)\b/,
    );
  });

  it('never shows a bar, a meter, or a star rating', async () => {
    stubMatch();
    withReceipt();
    const { container } = renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('[role="meter"]')).toBeNull();
    expect(container.querySelector('meter')).toBeNull();
    expect(document.body.textContent ?? '').not.toMatch(/[★☆*]{2,}/);
  });

  it('names one person, and only one', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    // The stored run holds fifty candidates, fifty of them eligible. Exactly one
    // person's name is on this page, and there is one monogram, so there is
    // nothing here that could be read as a shortlist.
    const names = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) => /[A-Z][a-z]+ [A-Z]/.test(text ?? ''));

    expect(names).toEqual(['Ananya Mehra']);
    expect(document.querySelectorAll('.rounded-full.border')).toHaveLength(1);
  });

  it('does not claim the matching was done by a machine or a model', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    const page = (document.body.textContent ?? '').toLowerCase();

    expect(page).not.toMatch(
      /\bai\b|\bmachine learning\b|\balgorithm\b|\bmodel\b|\bdata points?\b/,
    );
  });
});

describe('the next step, which is not built yet', () => {
  it('offers "this feels right" and says plainly that it is not available', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    const button = await screen.findByRole('button', { name: /this feels right/i });

    // Focusable and announced, rather than `disabled` and invisible to a keyboard.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById('rematch-hint')).toHaveTextContent(/has not been built yet/i);
  });

  it('offers a way back to the answers, because changing your mind is allowed', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    expect(await screen.findByRole('link', { name: /back to your answers/i })).toHaveAttribute(
      'href',
      paths.intake,
    );
  });

  it('says the prototype’s therapists are fictional', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    expect(
      await screen.findByText(/every therapist in this prototype is fictional/i),
    ).toBeInTheDocument();
  });

  it('says nothing you wrote was interpreted', async () => {
    stubMatch();
    withReceipt();
    renderRoute(paths.recommendation);

    expect(await screen.findByText(/nothing you wrote was interpreted/i)).toBeInTheDocument();
  });
});

describe('while it is working', () => {
  it('says what is happening, without pretending to think', async () => {
    stubMatch({ hold: true });
    withReceipt();
    renderRoute(paths.recommendation);

    expect(
      await screen.findByText(/looking through the therapists who may fit/i),
    ).toBeInTheDocument();

    const page = (document.body.textContent ?? '').toLowerCase();
    expect(page).not.toMatch(/thinking|analy[sz]ing|calculating|searching/);
  });

  it('shows no spinner and no skeleton', async () => {
    stubMatch({ hold: true });
    withReceipt();
    const { container } = renderRoute(paths.recommendation);

    await screen.findByText(/looking through the therapists/i);

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

describe('when nothing qualified', () => {
  it('says so in words, and not as a failure', async () => {
    stubMatch({ body: NOTHING_QUALIFIED });
    withReceipt();
    renderRoute(paths.recommendation);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /couldn’t find someone who fits all of the things you marked as important/i,
      }),
    ).toBeInTheDocument();
  });

  it('explains that it means the conditions, not the person', async () => {
    stubMatch({ body: NOTHING_QUALIFIED });
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 1, name: /couldn’t find someone/i });

    expect(screen.getByText(/rather than a failure/i)).toBeInTheDocument();
    expect(screen.getByText(/must-haves rather than preferences/i)).toBeInTheDocument();
  });

  it('never says "no therapist found"', async () => {
    stubMatch({ body: NOTHING_QUALIFIED });
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 1, name: /couldn’t find someone/i });

    expect(document.body.textContent?.toLowerCase()).not.toContain('no therapist found');
  });

  it('offers the honest next step, marked as not built', async () => {
    stubMatch({ body: NOTHING_QUALIFIED });
    withReceipt();
    renderRoute(paths.recommendation);

    const button = await screen.findByRole('button', { name: /loosen one thing and look again/i });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById('rematch-hint')).toHaveTextContent(/has not been built yet/i);
  });
});

describe('when something goes wrong', () => {
  it('explains a service failure in plain words, and offers a retry', async () => {
    stubMatch({
      status: 503,
      body: {
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'We could not reach where matches are recorded right now.',
      },
    });
    withReceipt();
    renderRoute(paths.recommendation);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('reassures that nothing was lost', async () => {
    stubMatch({ status: 500, body: { statusCode: 500, error: 'E', message: 'm' } });
    withReceipt();
    renderRoute(paths.recommendation);

    expect(await screen.findByText(/nothing was lost/i)).toBeInTheDocument();
  });

  it('shows no stack trace and no technical detail', async () => {
    stubMatch({
      status: 500,
      body: { statusCode: 500, error: 'E', message: 'at Object.<anonymous> (matches.ts:1:1)' },
    });
    withReceipt();
    renderRoute(paths.recommendation);

    await screen.findByText(/nothing was lost/i);

    expect(document.body.textContent ?? '').not.toMatch(/\.ts:\d+|at Object|stack/i);
  });
});

describe('with nothing to look up', () => {
  it('says so, and points at the questions', async () => {
    stubMatch();
    renderRoute(paths.recommendation);

    expect(
      await screen.findByRole('heading', { level: 1, name: /nothing here to explain yet/i }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /start the questions/i })).toHaveAttribute(
      'href',
      paths.intake,
    );
  });

  it('does not call the service at all', async () => {
    stubMatch();
    renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 1, name: /nothing here to explain yet/i });

    expect(stub.requests).toHaveLength(0);
  });
});

describe('starting over', () => {
  it('forgets the reference, so nothing is left behind', async () => {
    stubMatch();
    withReceipt();
    const { router } = renderRoute(paths.recommendation);

    await screen.findByRole('heading', { level: 2, name: 'Ananya Mehra' });

    screen.getByRole('button', { name: /start over/i }).click();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.start);
    });

    expect(sessionStorage.getItem('wtm.intake.receipt.v1')).toBeNull();
  });
});
