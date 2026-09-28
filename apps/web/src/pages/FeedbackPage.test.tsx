import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';
import { paths } from '../routes/paths';
import { saveMatch, saveReceipt } from '../lib/intake/session';
import type { FeedbackReason, RematchRecommendation } from '../lib/api/types';

/**
 * The feedback page.
 *
 * The tests are mostly about restraint. It is very easy to build a page that asks
 * someone to say a recommendation did not feel right and turn it into a complaint form,
 * and the assertions below are the ones that would notice: no red, no ratings, no
 * "reject", a reason list that is multiple-choice rather than a verdict, and a free-text
 * box nobody is made to fill in.
 */

const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec';
const THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';

const REASONS: readonly FeedbackReason[] = [
  {
    key: 'communication-mismatch',
    name: 'The communication style didn’t feel right.',
    description: 'The way they talked did not feel like what you were after.',
  },
  {
    key: 'different-experience',
    name: 'I wanted someone with different experience.',
    description: 'You were hoping for a different kind of background or context.',
  },
  {
    key: 'not-the-right-approach',
    name: 'The way they work did not suit me.',
    description: 'Their approach was not the one you were looking for.',
  },
  {
    key: 'felt-uncomfortable',
    name: 'I did not feel understood.',
    description: 'The session did not feel like a fit to talk in.',
  },
  {
    key: 'availability-mismatch',
    name: 'The timing did not work for me.',
    description: 'There was no workable time for both of you.',
  },
  {
    key: 'language-mismatch',
    name: 'I would prefer someone who speaks another language.',
    description: 'Getting the words out was harder than it should have been.',
  },
  {
    key: 'format-mismatch',
    name: 'I would prefer a different session format.',
    description: 'You wanted a different kind of session.',
  },
  {
    key: 'other',
    name: 'Something else.',
    description: 'Something else, which you can put into your own words.',
  },
];

const REMATCH: RematchRecommendation = {
  matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb',
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
  whyThisMatch: [
    { key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi.', detail: 'Hindi' },
    {
      key: 'COMMUNICATION_STYLE',
      sentence: 'You wanted someone more exploratory.',
      detail: 'Exploratory',
    },
  ],
  whatChanged: [
    {
      category: 'COMMUNICATION_STYLE',
      detail: 'Communication style',
      sentence:
        'You told us the way they talked was not right, and this therapist works more in the Exploratory style you were after.',
    },
  ],
  adjustedFor: ['communication-mismatch'],
};

interface Options {
  /** The reasons endpoint's status. */
  readonly reasonsStatus?: number;
  /** The feedback endpoint's status. */
  readonly feedbackStatus?: number;
  /** Held back until `release` is called, for testing the sending state. */
  readonly holdFeedback?: boolean;
  readonly match?: unknown;
  readonly withMatchRecord?: boolean;
}

let releaseFeedback: () => void = () => undefined;
let sent: { url: string; body: unknown }[] = [];

function stubApi(options: Options = {}): void {
  const gate = new Promise<void>((resolve) => {
    releaseFeedback = resolve;
  });

  sent = [];

  if (options.withMatchRecord === true) {
    saveReceipt({ intakeId: INTAKE_ID, receivedAt: '2026-09-30T09:00:00.000Z' });
    saveMatch({
      matchId: MATCH_ID,
      therapistName: 'Ananya Mehra',
      attempt: 1,
      previousMatchId: null,
      previousTherapistName: null,
    });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : '';

      if (url.includes('/api/v1/feedback/reasons')) {
        return respond({ reasons: REASONS }, options.reasonsStatus ?? 200);
      }

      if (url.includes('/health')) {
        return respond({ status: 'ok', service: 'test', version: '0.0.0', timestamp: '' });
      }

      if (url.includes('/rematch')) {
        return respond(options.match ?? REMATCH, 200);
      }

      if (url.includes('/feedback')) {
        if (init?.method === 'POST') {
          sent.push({
            url,
            body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
          });

          if (options.holdFeedback === true) {
            await gate;
          }

          return respond(
            {
              feedbackId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f0',
              matchId: MATCH_ID,
              reasons: [],
              recordedAt: '2026-10-05T12:00:00.000Z',
            },
            options.feedbackStatus ?? 201,
          );
        }
      }

      return respond(null, 404);
    }),
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  releaseFeedback();
  vi.unstubAllGlobals();
});

describe('what the page says', () => {
  it('asks what did not fit, in the brief’s words', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    expect(
      await screen.findByRole('heading', { level: 1, name: /didn’t quite fit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/helps us look for something different next time/i),
    ).toBeInTheDocument();
  });

  it('names who is being talked about, because the question is about them', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Ananya Mehra')).toBeInTheDocument();
  });

  it('offers the reasons from the database, not a list written into the client', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    const list = await screen.findByRole('group');

    for (const reason of REASONS.slice(0, 5)) {
      expect(within(list).getByText(reason.name)).toBeInTheDocument();
    }
  });

  it('keeps a sound heading structure', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    expectSoundHeadingStructure();
  });
});

describe('what the page must not become', () => {
  it('never calls it a rejection, a dislike, or a bad match', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    const page = (document.body.textContent ?? '').toLowerCase();

    expect(page).not.toMatch(
      /\breject(ed|ion)?\b|\bdislike\b|bad match|\bpoor\b|\bincompetent\b|\bwrong (therapist|choice)\b/,
    );
  });

  it('has no stars, no thumbs, and no rating control of any kind', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    // Radio buttons would force a single verdict, which is the opposite of what the
    // data model is for. Every reason must be independently tickable.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(1);
  });

  it('uses no red, and says nothing is wrong', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    // The only clay-coloured text on the page may be the inline problem message, and
    // that is the same tint every other calm state in the product uses — not an alert
    // red. Asserted by scanning for the danger palette.
    const classes = [...document.querySelectorAll('*')].flatMap((element) =>
      [...element.classList].filter((name) => /^(bg|text|border)-red/.test(name)),
    );

    expect(classes).toEqual([]);
  });

  it('does not blame the therapist anywhere in its own copy', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    // The reasons come from the database, so this is really asserting the page does not
    // add framing of its own on top of them.
    const page = (document.body.textContent ?? '').toLowerCase();

    expect(page).not.toMatch(/they (failed|let you down|weren't good enough)|unprofessional/i);
  });
});

describe('choosing reasons', () => {
  it('lets someone pick more than one, because several can be true', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    const first = screen.getByRole('checkbox', { name: /communication style/i });
    const second = screen.getByRole('checkbox', { name: /different experience/i });

    await user.click(first);
    await user.click(second);

    expect(first).toBeChecked();
    expect(second).toBeChecked();
  });

  it('lets someone untick a reason, because a first thought is not a verdict', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    const option = screen.getByRole('checkbox', { name: /communication style/i });

    await user.click(option);
    expect(option).toBeChecked();

    await user.click(option);
    expect(option).not.toBeChecked();
  });

  it('shows the rest of the reasons behind one control, and says how many', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    // Eight reasons is a wall of text on a phone. The page shows five and says so.
    expect(screen.queryByRole('checkbox', { name: /something else/i })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /show all reasons/i });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByRole('checkbox', { name: /something else/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show fewer reasons/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('the optional note', () => {
  it('is never required, and never marked as one', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    const note = screen.getByLabelText(/anything else/i);

    expect(note).not.toBeRequired();
    expect(note).not.toHaveAttribute('aria-required', 'true');
    expect(screen.getByText(/entirely optional/i)).toBeInTheDocument();
  });

  it('can be the only thing given', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    await user.type(screen.getByLabelText(/anything else/i), 'I could not say what I wanted.');
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    await waitFor(() => expect(sent).toHaveLength(1));

    // A note on its own is a real answer, so an empty reasons array goes with it rather
    // than being refused.
    expect(sent[0]?.body).toEqual({ reasons: [], rawText: 'I could not say what I wanted.' });
  });

  it('is not sent at all when left blank', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    await waitFor(() => expect(sent).toHaveLength(1));

    // An empty field sent as `""` would be stored as a note made of nothing.
    expect(sent[0]?.body).toEqual({ reasons: ['communication-mismatch'] });
  });
});

describe('sending', () => {
  it('refuses to send nothing, and says why without blaming anyone', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    const problem = await screen.findByRole('alert');

    expect(problem).toHaveTextContent(/either is enough/i);
    expect(sent).toHaveLength(0);
  });

  it('associates the message with the list, so a screen reader is told why', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    const problem = await screen.findByRole('alert');
    const group = screen.getByRole('group');

    expect(group).toHaveAttribute('aria-describedby', problem.id);
  });

  it('says it is sending, and does not let it be sent twice', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true, holdFeedback: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));

    const submit = screen.getByRole('button', { name: /look for someone else/i });
    await user.click(submit);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look for someone else/i })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );

    // A double click must not become a second complaint about a person, and the server
    // would collapse it anyway — but the page should not offer the chance.
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));
    expect(sent).toHaveLength(1);
  });

  it('keeps everything on the page when the save fails, and says nothing was lost', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true, feedbackStatus: 503 });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));
    await user.type(screen.getByLabelText(/anything else/i), 'Something of my own.');
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    const problem = await screen.findByRole('alert');

    expect(problem).toHaveTextContent(/nothing you wrote has been lost/i);
    // Still there, so a second attempt sends the same thing rather than a fresh one.
    expect(screen.getByRole('checkbox', { name: /communication style/i })).toBeChecked();
    expect(screen.getByLabelText(/anything else/i)).toHaveValue('Something of my own.');
  });

  it('never shows a stack trace or a status code', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true, feedbackStatus: 500 });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    await screen.findByRole('alert');

    expect(document.body.textContent).not.toMatch(/\b500\b|\bat Object|node_modules|ECONN/i);
  });

  it('sends only the keys, and nothing that could steer the search', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    await waitFor(() => expect(sent).toHaveLength(1));

    expect(Object.keys(sent[0]?.body as object).sort()).toEqual(['reasons']);
    // The reason travels as the vocabulary key, which is the contract the engine matches
    // on. The wording is the interface's, and is never sent anywhere.
    expect((sent[0]?.body as { reasons: string[] }).reasons).toEqual(['communication-mismatch']);
  });

  it('addresses the feedback at the match it is about, and names nobody else', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    await waitFor(() => expect(sent).toHaveLength(1));

    expect(sent[0]?.url).toContain(MATCH_ID);
    expect(JSON.stringify(sent[0]?.body)).not.toMatch(
      /clientId|therapistId|excluded|score|weight|intakeId/i,
    );
  });

  it('hands over to the search once the reason is safely recorded', async () => {
    const user = userEvent.setup();
    stubApi({ withMatchRecord: true });
    const { router } = renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('checkbox', { name: /communication style/i }));
    await user.click(screen.getByRole('button', { name: /look for someone else/i }));

    // The search is its own step rather than a page that only says "now we will look".
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.matching));
  });
});

describe('when there is nothing to give feedback about', () => {
  it('says so, and offers the questions instead of a form', async () => {
    stubApi();
    renderRoute(paths.feedback);

    expect(
      await screen.findByRole('heading', { level: 1, name: /no recommendation here/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/anything else/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start the questions/i })).toHaveAttribute(
      'href',
      paths.intake,
    );
  });
});

describe('when the reasons cannot be fetched', () => {
  it('explains it, and offers a retry rather than an empty form', async () => {
    stubApi({ withMatchRecord: true, reasonsStatus: 503 });
    renderRoute(paths.feedback);

    // The reasons cannot be shown, so the page says so rather than rendering a form
    // with nothing in it — which would let someone send an empty answer and believe
    // they had said something.
    await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());

    expect(screen.queryByLabelText(/anything else/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /look for someone else/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('on a small screen', () => {
  it('offers reasons as real checkboxes a thumb can reach', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    // Nothing depends on hover, on a rightward affordance, or on a pointer. Every
    // reason is a label wrapping a real input, so the row is the target.
    for (const option of screen.getAllByRole('checkbox')) {
      expect(option.closest('label')).not.toBeNull();
    }
  });

  it('keeps the submit control full width in the flow, not floating', async () => {
    stubApi({ withMatchRecord: true });
    renderRoute(paths.feedback);

    await screen.findByRole('heading', { level: 1 });

    const submit = screen.getByRole('button', { name: /look for someone else/i });
    const row = submit.parentElement;

    // A vertical stack rather than a side-by-side pair, which is what keeps a long
    // label from squeezing a button below 44px on a 320px screen.
    expect(row).toHaveClass('flex-col');
  });
});
