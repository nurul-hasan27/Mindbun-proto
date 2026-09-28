import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseSummaryPanel } from './CaseSummaryPanel';
import { createApiClient } from '../../lib/api/client';
import { stubFetch, type StubHandler } from '../../test/stubFetch';

/**
 * The reviewer's only AI surface.
 *
 * Three things are being defended, and they are all the same claim from different angles:
 * **this cannot become the thing a matcher reads instead of the evidence.**
 *
 * - It is not there until it is asked for, so a summary is never the first thing on the page.
 * - It sits below the evidence rather than above it.
 * - A summary that fails its check is left out entirely, and the page says so, rather than
 *   being shown unchecked.
 */

const BASE_URL = 'http://api.test:4000';
const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7e8';

const SUMMARY = {
  summary:
    'They are looking for support around work stress and exploratory conversations. Ananya Rao does not carry exploratory.',
  observations: [
    'They asked for exploratory, and Ananya Rao does not offer it.',
    '2 other candidates met everything marked as important.',
  ],
  tradeoffs: ['Dev Menon covers style where Ananya Rao does not, and misses online.'],
  provider: 'mock',
} as const;

beforeEach(() => {
  globalThis.sessionStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('before it is asked for', () => {
  it('shows an offer and no summary', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );

    render(<CaseSummaryPanel matchId={MATCH_ID} />);

    expect(screen.getByRole('heading', { name: /ai perspective/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /write a summary/i })).toBeInTheDocument();
    expect(screen.queryByText(SUMMARY.summary)).toBeNull();
  });

  it('makes no request, so nobody is billed for a summary they did not want', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    render(<CaseSummaryPanel matchId={MATCH_ID} />);

    // Three reasons this is not automatic, in the interface: a model call per case review is
    // a bill nobody agreed to, a summary paragraph invites being read first, and a failure
    // should not be the first thing on a page a matcher needs to work from.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says up front that it cannot change anything', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );

    render(<CaseSummaryPanel matchId={MATCH_ID} />);

    expect(screen.getByText(/cannot change anything/i)).toBeInTheDocument();
  });
});

describe('when it is asked for', () => {
  function stub(handler: StubHandler): void {
    const { fetchImpl } = stubFetch(handler);
    vi.stubGlobal('fetch', fetchImpl);
  }

  it('shows the summary, the observations and the tradeoffs', async () => {
    stub(() => ({ json: SUMMARY }));
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));

    expect(await screen.findByText(SUMMARY.summary)).toBeInTheDocument();
    expect(screen.getByText(SUMMARY.observations[0])).toBeInTheDocument();
    expect(screen.getByText(SUMMARY.tradeoffs[0])).toBeInTheDocument();
  });

  it('asks for the case and nothing else', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ json: SUMMARY }));
    const client = createApiClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl });
    const { fetchCaseSummary } = await import('../../lib/api/aiWorkspace');

    await fetchCaseSummary(MATCH_ID, client);

    // A GET of a path. No body, no query, and therefore no field through which a caller
    // could name a therapist, an intake, a client, or a piece of text to summarise.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain(`/matching-workspace/cases/${MATCH_ID}/ai-summary`);
    // A GET with no body and no query. There is no field through which a caller could name
    // a therapist, an intake, a client, or a piece of text to summarise.
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('says where an empty tradeoff list means, rather than leaving a gap', async () => {
    stub(() => ({ json: { ...SUMMARY, tradeoffs: [] } }));
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));

    expect(await screen.findByText(/no genuine tradeoffs stood out/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /tradeoffs/i })).toBeNull();
  });

  it('states the boundary once, in plain words', async () => {
    stub(() => ({ json: SUMMARY }));
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));
    await screen.findByText(SUMMARY.summary);

    const note = screen.getByText(/cannot change scores, eligibility or the decision/i);
    expect(note).toBeInTheDocument();
    // A matcher is told which model wrote it, because "the summary said so" is otherwise an
    // answer to a question nobody asked.
    expect(note.textContent).toContain('mock');
  });

  it('has no control that could touch the decision', async () => {
    stub(() => ({ json: SUMMARY }));
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));
    await screen.findByText(SUMMARY.summary);

    // Only "write it again". No accept, no override, no adjust — the panel has no route to
    // anything the matcher is about to do.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Write it again',
    ]);
  });
});

describe('when it cannot be trusted', () => {
  function stubFailure(status: number): void {
    const { fetchImpl } = stubFetch(() => ({
      status,
      json: { statusCode: status, error: 'x', message: 'The case summary could not be trusted.' },
    }));
    vi.stubGlobal('fetch', fetchImpl);
  }

  it('says the summary was left out rather than shown unchecked', async () => {
    stubFailure(502);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));

    expect(await screen.findByText(/left out rather than shown unchecked/i)).toBeInTheDocument();
  });

  it('announces a refusal, because a silent panel reads as a page that failed to load', async () => {
    stubFailure(502);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('says the evidence is unaffected, and says it plainly', async () => {
    stubFailure(502);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));

    expect(
      await screen.findByText(/everything above this line is unaffected/i),
    ).toBeInTheDocument();
  });

  it('distinguishes switched off from broken', async () => {
    stubFailure(503);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));

    expect(await screen.findByText(/switched off/i)).toBeInTheDocument();
  });

  it('lets a matcher retry and lets them leave it out', async () => {
    stubFailure(502);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));
    await screen.findByText(/left out rather than shown unchecked/i);

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // "Leave it out" returns the panel to its opening state, so a matcher who does not want
    // the feature is not left looking at an error.
    await user.click(screen.getByRole('button', { name: /leave it out/i }));

    expect(screen.getByRole('button', { name: /write a summary/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('accessibility', () => {
  it('has one heading for the panel and one per list', async () => {
    const { fetchImpl } = stubFetch(() => ({ json: SUMMARY }));
    vi.stubGlobal('fetch', fetchImpl);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);
    await user.click(screen.getByRole('button', { name: /write a summary/i }));
    await screen.findByText(SUMMARY.summary);

    expect(screen.getByRole('heading', { level: 2, name: /ai perspective/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /things worth reviewing/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /tradeoffs/i })).toBeInTheDocument();
  });

  it('reaches every control by keyboard', async () => {
    const { fetchImpl } = stubFetch(() => ({ json: SUMMARY }));
    vi.stubGlobal('fetch', fetchImpl);
    const user = userEvent.setup();

    render(<CaseSummaryPanel matchId={MATCH_ID} />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /write a summary/i }));
  });
});
