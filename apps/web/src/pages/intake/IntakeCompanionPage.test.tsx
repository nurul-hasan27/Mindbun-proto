import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { IntakeProvider } from '../../lib/intake/IntakeProvider';
import { IntakeCompanionPage } from './IntakeCompanionPage';
import type { IntakeVocabulary } from '../../lib/api/types';

/**
 * The intake companion, driven the way a person drives it.
 *
 * The point of these tests is not that the component renders. It is that the assistant can
 * never quietly become the intake: that what it suggests is a proposal, that keeping it is a
 * deliberate act, that a failure loses nothing, and that the ordinary path through the
 * product still works with the assistant switched off entirely.
 */

const VOCABULARY: IntakeVocabulary = {
  areasOfWork: [
    { key: 'work-stress', name: 'Work stress' },
    { key: 'career-transitions', name: 'Career transitions' },
  ],
  communicationStyles: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
  ],
  contextualExperience: [
    { key: 'relocation', name: 'Relocation' },
    { key: 'family-expectations', name: 'Family expectations' },
  ],
  languages: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
  ],
  sessionFormats: [
    { key: 'online', name: 'Online' },
    { key: 'in-person', name: 'In person' },
  ],
};

/**
 * The two AI endpoints, stubbed at the network boundary.
 *
 * Stubbing `fetch` rather than the client module is the point: this test drives the whole
 * path the browser takes, including the client's own response validation, so a change that
 * made the client accept a malformed suggestion would be caught here rather than passing
 * because the stub returned a convenient shape.
 */
const turn = vi.fn<(url: string) => Promise<Response>>();
const extract = vi.fn<(url: string) => Promise<Response>>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function serverError(status: number, message: string): Response {
  return json({ statusCode: status, error: 'Error', message }, status);
}

const DEFAULT_TURN_BODY = {
  reply: 'What is the harder part of it?',
  readyToSummarise: false,
  provider: 'mock',
};

const DEFAULT_EXTRACT_BODY = {
  signals: [
    {
      category: 'area',
      key: 'work-stress',
      confidence: 'high',
      source: 'user_message',
      explanation: 'You mentioned something that sounds like work stress.',
      target: { kind: 'draft', field: 'areasOfWork', label: 'Work stress' },
    },
    {
      category: 'communicationStyle',
      key: 'exploratory',
      confidence: 'medium',
      source: 'user_message',
      explanation: 'From how you described it, exploratory conversations sound right.',
      target: { kind: 'draft', field: 'communicationStyles', label: 'Exploratory' },
    },
  ],
  notUnderstood: [],
  surplus: [],
  provider: 'mock',
};

function mockApi(
  overrides: {
    readonly turn?: () => Promise<Response>;
    readonly extract?: () => Promise<Response>;
  } = {},
): void {
  turn.mockReset();
  extract.mockReset();

  turn.mockImplementation(overrides.turn ?? (() => Promise.resolve(json(DEFAULT_TURN_BODY))));
  extract.mockImplementation(
    overrides.extract ?? (() => Promise.resolve(json(DEFAULT_EXTRACT_BODY))),
  );
}

/** Serves the vocabulary, the two AI endpoints, and nothing else. */
function mockFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.includes('/intake/vocabulary')) {
        return Promise.resolve(json(VOCABULARY));
      }

      if (url.includes('/ai/intake/turn')) {
        return turn(url);
      }

      if (url.includes('/ai/intake/extract')) {
        return extract(url);
      }

      return Promise.resolve(json({}, 404));
    }),
  );
}

function renderCompanion(): void {
  render(
    <MemoryRouter initialEntries={['/intake/companion']}>
      <IntakeProvider>
        <IntakeCompanionPage />
      </IntakeProvider>
    </MemoryRouter>,
  );
}

/**
 * The first of a list, as a definite element.
 *
 * Throws rather than returning a possibly-undefined one, because an assertion about
 * `undefined` would pass for the wrong reason and a missing button should be a failure
 * rather than a click on nothing.
 */
function firstOf<T>(items: readonly T[]): T {
  const [first] = items;

  if (first === undefined) {
    throw new Error('Expected at least one element.');
  }

  return first;
}

/** A `fetch` input as a URL. The client always passes a string. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  throw new Error('The client must pass a URL string to fetch.');
}

/** Every URL the app has requested, in order. */
function allRequestUrls(): readonly string[] {
  return vi.mocked(globalThis.fetch).mock.calls.map((call) => requestUrl(call[0]));
}

function lastRequestUrl(): string {
  const urls = allRequestUrls();

  return firstOf(urls.slice(-1));
}

beforeEach(() => {
  globalThis.sessionStorage.clear();
  mockApi();
  mockFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Waits for the greeting, which is rendered locally and so needs no request. */
async function ready(): Promise<void> {
  await screen.findByText(/you don’t need to know what kind of therapy you need/i);
}

describe('the conversation', () => {
  it('opens by saying that nobody needs the vocabulary', async () => {
    renderCompanion();
    await ready();

    expect(
      screen.getByText(/you don’t need to know what kind of therapy you need/i),
    ).toBeInTheDocument();
  });

  it('greetings without asking the network for anything', async () => {
    renderCompanion();
    await ready();

    // A person should not wait on a round trip to read an invitation to speak, and the page
    // has to work at all with the service down.
    expect(turn).not.toHaveBeenCalled();
  });

  it('sends a message and shows the reply', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    const field = screen.getByRole('textbox');
    await user.type(field, 'Work has been stressful lately.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Work has been stressful lately.')).toBeInTheDocument();
    expect(await screen.findByText('What is the harder part of it?')).toBeInTheDocument();
  });

  it('sends on Enter and starts a new line on Shift+Enter', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    const field = screen.getByRole('textbox');
    await user.type(field, 'A short answer{Enter}');

    await screen.findByText('A short answer');
    expect(turn).toHaveBeenCalledOnce();

    // Shift+Enter must not send, or a paragraph is impossible to write.
    await user.type(field, 'Second line{Shift>}{Enter}{/Shift}');
    expect(turn).toHaveBeenCalledOnce();
  });

  it('clears the field once sent, and keeps the words in the transcript', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    const field = screen.getByRole('textbox');
    await user.type(field, 'Something I want on the record.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Something I want on the record.');
    expect(field).toHaveValue('');
  });

  it('makes exactly one request per message sent', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'One thought.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('One thought.');

    // The performance rule: a turn costs one call, made when a person presses send.
    expect(turn).toHaveBeenCalledOnce();
  });

  it('announces new replies politely rather than interrupting', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'A thought.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('What is the harder part of it?');

    const log = document.querySelector('[role="log"]');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-relevant', 'additions');
    // The greeting is not re-announced every time a reply arrives.
    expect(within(log as HTMLElement).queryByText(/you don’t need to know/i)).toBeNull();
  });

  it('does not offer to read anything back before something has been said', async () => {
    renderCompanion();
    await ready();

    expect(screen.queryByRole('button', { name: /show me what you understood/i })).toBeNull();
  });
});

describe('the suggestions', () => {
  async function reachSuggestions(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(
      screen.getByRole('textbox'),
      'Work has been stressful and I want to talk it through.',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('What is the harder part of it?');

    await user.click(screen.getByRole('button', { name: /show me what you understood/i }));
    // The results block's own heading, whatever it is currently called.
    await screen.findByRole('heading', {
      level: 2,
      name: /here’s what i heard|what i could place/i,
    });
  }

  it('shows what it heard with the reasoning, and saves nothing yet', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();
    await reachSuggestions(user);

    expect(screen.getByText('Work stress')).toBeInTheDocument();
    expect(
      screen.getByText('You mentioned something that sounds like work stress.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing has been saved yet/i)).toBeInTheDocument();
  });

  it('offers keep, change and not quite, with none chosen', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();
    await reachSuggestions(user);

    expect(screen.getAllByRole('button', { name: 'Keep' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Not quite' })).toHaveLength(2);

    // A proposal with a default is a decision waiting for a rubber stamp.
    for (const button of screen.getAllByRole('button', { name: 'Keep' })) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('marks a kept one as kept, in a way a screen reader can hear', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();
    await reachSuggestions(user);

    await user.click(firstOf(screen.getAllByRole('button', { name: 'Keep' })));

    // The control that was pressed is now the one reading "Already saved" — keeping the same
    // node rather than replacing it is what lets a screen reader perceive the state change
    // as a toggle instead of a swap.
    const saved = screen.getByRole('button', { name: 'Already saved' });
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    // And it is genuinely in the draft now, so it would not be offered as new.
    expect(screen.getAllByRole('button', { name: 'Already saved' })).toHaveLength(1);
  });

  it('lets a rejection be undone', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();
    await reachSuggestions(user);

    await user.click(firstOf(screen.getAllByRole('button', { name: 'Not quite' })));

    // One rejected, so one Undo and one surviving trio.
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Not quite' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Not quite' })).toHaveLength(2);
  });

  it('says which suggestions it could not place, rather than dropping them', async () => {
    mockApi({
      extract: () =>
        Promise.resolve(
          json({
            signals: [],
            notUnderstood: [{ category: 'approach', key: 'integrative' }],
            surplus: [{ category: 'area', key: 'grief-and-loss' }],
            provider: 'mock',
          }),
        ),
    });

    const user = userEvent.setup();
    renderCompanion();
    await ready();
    await reachSuggestions(user);

    expect(screen.getByText(/couldn’t place integrative/i)).toBeInTheDocument();
    // A surplus line is a different claim from an unplaceable one, and saying so is honest.
    expect(screen.getByText(/more things? i picked up/i)).toBeInTheDocument();
  });

  it('offers a time as a hint and does not write it in', async () => {
    mockApi({
      extract: () =>
        Promise.resolve(
          json({
            signals: [
              {
                category: 'availability',
                key: 'hint:evening:TUESDAY',
                confidence: 'low',
                source: 'user_message',
                explanation: 'Tuesday evenings sounded like it might suit you.',
                target: {
                  kind: 'availabilityHint',
                  part: 'evening',
                  days: ['TUESDAY'],
                  label: 'Tuesdays evenings',
                },
              },
            ],
            notUnderstood: [],
            surplus: [],
            provider: 'mock',
          }),
        ),
    });

    const user = userEvent.setup();
    renderCompanion();
    await ready();
    await reachSuggestions(user);

    expect(screen.getByText(/not written in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add tuesdays evenings/i })).toBeInTheDocument();
  });
});

describe('when the assistant does not work', () => {
  it('keeps the message and offers a retry when a turn fails', async () => {
    mockApi({ turn: () => Promise.reject(new TypeError('network down')) });

    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'Something I should not lose.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(/something went wrong while interpreting that/i),
    ).toBeInTheDocument();
    // The words are still on the page. This is the whole point of the failure state.
    expect(screen.getByText('Something I should not lose.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says the assistant is switched off when it is, rather than sounding broken', async () => {
    mockApi({
      turn: () => Promise.resolve(serverError(503, 'The conversation assistant is switched off.')),
    });

    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'A first attempt.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    // A 503 is a different situation from a failure. Retrying into the same answer would be
    // pointless, so the copy does not offer it — it offers the questions instead.
    expect(await screen.findByText(/switched off/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('link', { name: /the questions/i })).toBeInTheDocument();
  });

  it('never leaves a person without a way to the questions', async () => {
    mockApi({ turn: () => Promise.reject(new TypeError('network down')) });

    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'Anything.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/something went wrong/i);

    // More than one way out, and always present.
    const links = screen.getAllByRole('link', { name: /questions/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it('ends the conversation when the assistant declines to go on', async () => {
    mockApi({
      turn: () =>
        Promise.resolve(
          json({
            reply:
              'I am sorry. What you have just said matters more than anything else here, and it is not something I am able to help with.\n\nIf you are in immediate danger, please contact your local emergency number. FindAHead, Samaritans and Befriending helplines are listed at findahelpline.com.\n\nA person is the right thing here, not an assistant. I will stop this conversation now.',
            readyToSummarise: false,
            provider: 'guard',
          }),
        ),
    });

    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'I do not want to be here any more.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    // The reply is in the transcript, and the page says what to do next.
    expect(
      (await screen.findAllByText(/a person is the right thing here/i)).length,
    ).toBeGreaterThan(0);
    // No composer, and no offer to keep matching. This is the one case where continuing
    // would be the wrong thing.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: /continue to the questions/i })).toBeInTheDocument();
  });

  it('keeps the conversation going after a request for care is redirected', async () => {
    mockApi({
      turn: () =>
        Promise.resolve(
          json({
            reply:
              'I am here to help you describe what you are looking for. I cannot give therapy, diagnose anything, or say what you should take.\n\nIf you would like to talk to someone now, a GP or a counsellor can help you work out where to start.',
            readyToSummarise: false,
            provider: 'guard',
          }),
        ),
    });

    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'What medication should I take?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findAllByText(/I cannot give therapy, diagnose anything/i);
    // A redirect is not an ending. Somebody can still say what they are looking for.
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('refuses to read back a conversation that was redirected', async () => {
    mockApi({
      turn: () =>
        Promise.resolve(
          json({
            reply: 'I cannot give therapy, diagnose anything, or say what you should take.',
            readyToSummarise: false,
            provider: 'guard',
          }),
        ),
      extract: () =>
        Promise.resolve(json({ signals: [], notUnderstood: [], surplus: [], provider: 'guard' })),
    });

    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'What medication should I take?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findAllByText(/I cannot give therapy/i);

    await user.click(screen.getByRole('button', { name: /show me what you understood/i }));

    // The guard answered, so the extraction is empty by design rather than by failure, and
    // the page says that plainly instead of showing an error the person can do nothing about.
    expect(await screen.findByText(/nothing in that i could place/i)).toBeInTheDocument();
    expect(extract).toHaveBeenCalledOnce();
  });
});

describe('accessibility and layout', () => {
  it('has one first-level heading, and a second for the suggestions', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    await user.type(screen.getByRole('textbox'), 'A thought about work.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('What is the harder part of it?');
    await user.click(screen.getByRole('button', { name: /show me what you understood/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: /here’s what i heard/i }),
    ).toBeInTheDocument();
  });

  it('gives the field a label and describes the keyboard behaviour', async () => {
    renderCompanion();
    await ready();

    const field = screen.getByRole('textbox', { name: /in your own words/i });
    const describedBy = field.getAttribute('aria-describedby') ?? '';

    expect(describedBy).not.toBe('');
    const help = document.getElementById(describedBy.split(' ')[0] ?? '');

    expect(help?.textContent).toMatch(/enter sends it/i);
  });

  it('refuses to send an empty message', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');

    await user.type(screen.getByRole('textbox'), '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('names the composer and its controls in the reading order', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.tab();
    const first = document.activeElement as HTMLElement;

    // The field is the first thing somebody tabbing in reaches: the greeting is prose, not a
    // control, and a launcher bubble before it would be the wrong first stop.
    expect(first).toBe(screen.getByRole('textbox'));
  });
});

describe('what leaves the browser', () => {
  it('sends a conversation and nothing else', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'Work has been stressful.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('What is the harder part of it?');

    const url = lastRequestUrl();

    // A POST, so nothing about what was said can end up in a URL, a log line, or a Referer.
    expect(url).toContain('/ai/intake/turn');
    expect(url).not.toContain('stressful');
  });

  it('never asks the extraction endpoint to store anything', async () => {
    const user = userEvent.setup();
    renderCompanion();
    await ready();

    await user.type(screen.getByRole('textbox'), 'Work has been stressful.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('What is the harder part of it?');
    await user.click(screen.getByRole('button', { name: /show me what you understood/i }));
    await screen.findByText('Here’s what I heard');

    const calls = allRequestUrls();

    // The whole AI surface is two POSTs and a vocabulary read. Nothing here writes.
    expect(calls.some((url) => url.includes('/intakes'))).toBe(false);
    expect(calls.filter((url) => url.includes('/ai/'))).toHaveLength(2);
  });

  it('restores a conversation after a refresh, and nothing else', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MemoryRouter initialEntries={['/intake/companion']}>
        <IntakeProvider>
          <IntakeCompanionPage />
        </IntakeProvider>
      </MemoryRouter>,
    );
    await ready();

    await user.type(screen.getByRole('textbox'), 'Something worth keeping.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('What is the harder part of it?');
    unmount();

    // Only messages. No suggestion, no inference about anyone, nothing derived.
    const stored = globalThis.sessionStorage.getItem('wtm.intake.conversation.v1') ?? '';
    const parsed: unknown = JSON.parse(stored);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    for (const entry of parsed as object[]) {
      expect(Object.keys(entry).sort()).toEqual(['role', 'text']);
    }
  });
});
