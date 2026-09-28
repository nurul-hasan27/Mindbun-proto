import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';
import { paths, workspaceCasePath } from '../routes/paths';
import type { CaseDetail, CaseSummary } from '../lib/api/workspace';

/**
 * The matching workspace, as the matcher experiences it.
 *
 * ## What these tests are actually for
 *
 * The API's tests prove the server refuses the wrong things and never sends a score. What
 * only a browser can prove is the half of the brief that is about *how the work feels*:
 * that agreeing and disagreeing are equally weighted on the page, that the reasons are
 * asked for only when something is being overridden, that a case decided shows a record
 * rather than a form, and that the client's own words stay out of the payload until
 * somebody deliberately asks.
 *
 * So the emphasis here is on wording, on what appears and when, and on the absence of the
 * things this product must never show. Several tests assert an *absence* — no score, no
 * percentage, no rank, no candidate the server did not offer — because an absence is the
 * requirement and nothing else checks it.
 */

const MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea';
const ALTERNATIVE_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb';
const THIRD_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ec';
const SET_ASIDE_MATCH_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ed';
const INTAKE_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ee';
const SUGGESTED_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ef';
const ALTERNATIVE_THERAPIST_ID = '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f0';

const CASE: CaseSummary = {
  matchId: MATCH_ID,
  intakeId: INTAKE_ID,
  attempt: 1,
  primaryNeeds: ['Hindi', 'Relationships', 'Exploratory'],
  systemSuggestedName: 'Tara Joshi',
  status: 'NEEDS_REVIEW',
  hasHistory: false,
};

const CASE_WITH_HISTORY: CaseSummary = {
  ...CASE,
  matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f1',
  attempt: 3,
  primaryNeeds: ['English', 'Work and career', 'Reflective'],
  systemSuggestedName: 'Ruth Adeyemi',
  hasHistory: true,
};

function therapist(
  id: string,
  displayName: string,
  style: string,
  areas: readonly string[],
): CaseDetail['suggestion']['therapist'] {
  return {
    id,
    displayName,
    headline: `${style}, reflective`,
    bio: 'A biography.',
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 9,
    languages: [
      { key: 'hi', name: 'Hindi' },
      { key: 'en', name: 'English' },
    ],
    areasOfWork: areas.map((name) => ({ key: name.toLowerCase().replaceAll(' ', '-'), name })),
    communicationStyles: [{ key: style.toLowerCase(), name: style }],
    approaches: [{ key: 'integrative', name: 'Integrative' }],
    contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
    sessionFormats: [{ key: 'online', name: 'Online' }],
    availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1200 }],
  };
}

const DETAIL: CaseDetail = {
  summary: CASE,
  needs: {
    areasOfWork: [
      { key: 'relationships', name: 'Relationships' },
      { key: 'career-transitions', name: 'Career transitions' },
    ],
    communicationStyles: [{ key: 'exploratory', name: 'Exploratory' }],
    approaches: [],
    contextualExperiences: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
    languages: [
      { key: 'hi', name: 'Hindi' },
      { key: 'en', name: 'English' },
    ],
    sessionFormats: [{ key: 'online', name: 'Online' }],
    availability: {
      timezone: 'Asia/Kolkata',
      windows: [{ dayOfWeek: 'MONDAY', startMinute: 1020, endMinute: 1260 }],
    },
    openToGuidance: false,
    markedAsRequirements: false,
  },
  suggestion: {
    matchId: MATCH_ID,
    therapist: therapist(SUGGESTED_THERAPIST_ID, 'Tara Joshi', 'Direct', ['Relationships']),
    eligible: true,
    rejectionCode: null,
    shared: [
      { key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi, one of the languages you chose.' },
      { key: 'AREA_OF_WORK', sentence: 'They work with relationships, which you asked for.' },
    ],
    notOffered: [{ category: 'AREA_OF_WORK', names: ['Career transitions'] }],
  },
  alternatives: [
    {
      matchId: ALTERNATIVE_MATCH_ID,
      therapist: therapist(ALTERNATIVE_THERAPIST_ID, 'Aditi Raghunathan', 'Exploratory', [
        'Career transitions',
      ]),
      eligible: true,
      rejectionCode: null,
      shared: [
        { key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi, one of the languages you chose.' },
        { key: 'COMMUNICATION_STYLE', sentence: 'They help you explore things.' },
      ],
      notOffered: [{ category: 'AREA_OF_WORK', names: ['Relationships'] }],
    },
    {
      matchId: THIRD_MATCH_ID,
      therapist: therapist('0199a1c2-3d4e-5f60-8712-93a4b5c6d7f2', 'Ayaan Qureshi', 'Warm', [
        'Relationships',
      ]),
      eligible: true,
      rejectionCode: null,
      shared: [{ key: 'REQUIRED_LANGUAGE', sentence: 'They speak Hindi.' }],
      notOffered: [],
    },
    {
      matchId: SET_ASIDE_MATCH_ID,
      therapist: therapist(
        '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f3',
        'Ruth Adeyemi',
        'Reflective',
        [],
      ),
      eligible: false,
      rejectionCode: 'REQUIREMENT_NOT_MET',
      shared: [],
      notOffered: [{ category: 'LANGUAGE', names: ['Hindi', 'English'] }],
    },
  ],
  selectableMatchIds: [MATCH_ID, ALTERNATIVE_MATCH_ID, THIRD_MATCH_ID],
  decisionReasons: [
    {
      key: 'better-communication-style',
      name: 'Better communication style',
      description: 'A way of talking closer to what the client asked for.',
    },
    {
      key: 'stronger-contextual-experience',
      name: 'Stronger contextual experience',
      description: 'More of the experience this person said matters to them.',
    },
    {
      key: 'other',
      name: 'Something else',
      description: 'Something else you can put into your own words.',
    },
  ],
  journey: [
    {
      attempt: 1,
      matchId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f4',
      systemSuggestedName: 'Ananya Mehra',
      clientFeedback: ['communication-mismatch'],
      clientFeedbackNames: ['The communication style didn’t feel right.'],
      decision: null,
      selectedName: null,
      status: 'DECLINED',
    },
    {
      attempt: 2,
      matchId: MATCH_ID,
      systemSuggestedName: 'Tara Joshi',
      clientFeedback: [],
      clientFeedbackNames: [],
      decision: null,
      selectedName: null,
      status: 'RECOMMENDED',
    },
  ],
  decision: null,
  clientsWords: null,
};

const DECIDED_DECISION = {
  id: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7f5',
  matchId: MATCH_ID,
  selectedMatchId: ALTERNATIVE_MATCH_ID,
  decisionType: 'HUMAN_SELECTED_ALTERNATIVE' as const,
  reasonKeys: ['stronger-contextual-experience'],
  note: 'Aditi has lived it rather than studied it.',
  recordedAt: '2026-10-12T09:00:00.000Z',
};

const DECIDED: CaseDetail = {
  ...DETAIL,
  summary: { ...CASE, status: 'DECIDED' },
  journey: DETAIL.journey.map((step) =>
    step.matchId === MATCH_ID
      ? { ...step, decision: DECIDED_DECISION, selectedName: 'Aditi Raghunathan' }
      : step,
  ),
  decision: DECIDED_DECISION,
};

const WORDS = {
  intakeNote: 'I keep explaining my family to people who have never lived somewhere else.',
  feedbackNotes: [{ attempt: 1, note: 'Too businesslike for me.' }],
};

interface Answer {
  readonly status?: number;
  readonly body?: unknown;
  /** Held back until the gate opens, for testing a waiting state. */
  readonly hold?: boolean;
}

interface Recorded {
  readonly url: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

let recorded: Recorded[] = [];
let respondWith: (url: string) => Answer = () => ({ body: {} });

function stubApi(): void {
  recorded = [];

  // A gate nothing opens, for the tests that only care about the waiting state.
  const gate = new Promise<void>(() => undefined);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : '';

      if (url.includes('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      const raw = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;

      recorded.push({
        url,
        method: init?.method ?? 'GET',
        body: raw as Recorded['body'],
      });

      const answer: Answer = respondWith(url);

      if (answer.hold === true) {
        await gate;
      }

      return new Response(JSON.stringify(answer.body ?? {}), {
        status: answer.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

beforeEach(() => {
  stubApi();
  respondWith = (url) => {
    if (url.includes('/matching-workspace/cases/') && url.includes('decision')) {
      return {
        body: {
          decisionType: 'HUMAN_SELECTED_ALTERNATIVE',
          selectedMatchId: ALTERNATIVE_MATCH_ID,
          selectedTherapistName: 'Aditi Raghunathan',
          systemSuggestedName: 'Tara Joshi',
          differs: true,
          recordedAt: '2026-10-12T09:00:00.000Z',
        },
      };
    }

    if (url.includes('clientsWords=reveal')) {
      return { body: { ...DETAIL, clientsWords: WORDS } };
    }

    if (url.includes('/matching-workspace/cases/')) {
      return { body: DETAIL };
    }

    return { body: { cases: [CASE, CASE_WITH_HISTORY] } };
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the queue', () => {
  it('lists cases waiting, with what they need and what was suggested', async () => {
    renderRoute(paths.matchingWorkspace);

    expect(
      await screen.findByRole('heading', { name: 'Matching workspace', level: 1 }),
    ).toBeVisible();
    expect(await screen.findByText('2 cases are waiting.')).toBeVisible();

    // The needs line, joined with a middot, is what a queue is scanned by.
    expect(
      screen.getByRole('heading', { name: 'Hindi · Relationships · Exploratory' }),
    ).toBeVisible();
    expect(screen.getByText('System suggested Tara Joshi')).toBeVisible();
    expect(screen.getByText('System suggested Ruth Adeyemi')).toBeVisible();

    // The second line carries only what differs between rows. A third search says so, and
    // a client who has already given reasons says so — those are the two facts a matcher
    // sorts by, and they are the ones worth spending a row's width on.
    expect(screen.getByText('Search 3')).toBeVisible();
    expect(screen.getByText(/has already said what didn’t fit/i)).toBeVisible();

    // "Needs review" used to be on every row. The list holds undecided cases and nothing
    // else, so the status never varied and a column that never varies teaches nothing. The
    // heading above already carries it.
    expect(screen.queryByText('Needs review')).toBeNull();
  });

  it('links each case to its own page, and nothing else', async () => {
    renderRoute(paths.matchingWorkspace);

    await screen.findByText('2 cases are waiting.');
    const queue = screen.getByRole('list');
    const links = within(queue).getAllByRole('link');

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      workspaceCasePath(CASE.matchId),
      workspaceCasePath(CASE_WITH_HISTORY.matchId),
    ]);
  });

  it('has one h1 and a sound heading order', async () => {
    renderRoute(paths.matchingWorkspace);
    await screen.findByText('2 cases are waiting.');

    expectSoundHeadingStructure();
  });

  it('says the work is done, rather than showing an empty region', async () => {
    respondWith = () => ({ body: { cases: [] } });
    renderRoute(paths.matchingWorkspace);

    expect(await screen.findByText('Nothing is waiting.')).toBeVisible();
    expect(screen.getByText(/A new case appears here when/)).toBeVisible();
  });

  it('says it is loading, rather than showing a blank page', async () => {
    respondWith = () => ({ body: { cases: [CASE] }, hold: true });
    renderRoute(paths.matchingWorkspace);

    expect(await screen.findByText('Loading the cases.')).toBeVisible();
  });

  it('offers a way forward when the service cannot be reached', async () => {
    respondWith = () => ({ status: 503, body: { message: 'down' } });
    renderRoute(paths.matchingWorkspace);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('spends a first-pass row on nothing it does not need to say', async () => {
    respondWith = () => ({ body: { cases: [CASE] } });
    renderRoute(paths.matchingWorkspace);

    await screen.findByText('One case is waiting.');

    const row = screen.getByRole('listitem');

    // Who was suggested, and nothing else. A first pass has no second search and no
    // reasons given, and a row that says so is a row that spent its width confirming that
    // nothing has happened yet.
    expect(within(row).getByText('System suggested Tara Joshi')).toBeVisible();
    expect(within(row).queryByText(/Search 2|Second search/)).toBeNull();
    expect(within(row).queryByText(/already said/)).toBeNull();
  });

  it('never shows a count of anything but cases', async () => {
    renderRoute(paths.matchingWorkspace);
    await screen.findByText('2 cases are waiting.');

    // No KPI row, no chart, no dashboard furniture. The only number on this page is how
    // many cases there are, and it is a sentence.
    const body = document.body.textContent ?? '';

    // A queue is a list of cases. It carries no figure about the system's workload and no
    // chart of anything, because a dashboard is a different product with different
    // intentions towards the person reading it.
    expect(body).not.toMatch(/\d+\s*%/);
    for (const forbidden of ['conversion', 'throughput', 'KPI', 'this week', 'average']) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('a case', () => {
  it('answers what the client needs, in the order a matcher reads it', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));

    expect(
      await screen.findByRole('heading', { name: 'Reviewing this case', level: 1 }),
    ).toBeVisible();

    const needs = screen.getByRole('region', { name: 'What this client needs' });
    expect(within(needs).getByText('Hindi')).toBeVisible();
    expect(within(needs).getByText('English')).toBeVisible();
    expect(within(needs).getByText('Exploratory')).toBeVisible();
    expect(within(needs).getByText('Indian diaspora')).toBeVisible();
    // Their own times, in their own timezone, because that is what the engine used.
    expect(within(needs).getByText(/monday 17:00–21:00/)).toBeVisible();
    expect(within(needs).getByText(/Asia\/Kolkata/)).toBeVisible();
  });

  it('labels the engine’s answer a suggestion, not a recommendation', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    // The whole point of the surface is that the matcher can disagree. A heading that
    // called this a match would have settled the question before the page opened.
    expect(screen.getByRole('heading', { name: 'What the system suggested' })).toBeVisible();
    expect(screen.getAllByText('System suggestion')).toHaveLength(1);
    expect(screen.getAllByText('Why this could work').length).toBeGreaterThan(0);
  });

  it('shows the evidence for the suggestion, in the client’s own reading of it', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const suggestion = screen.getByRole('region', { name: 'What the system suggested' });

    expect(
      within(suggestion).getByText('They speak Hindi, one of the languages you chose.'),
    ).toBeVisible();
    // The same sentence appears under the alternatives, which is deliberate: a reviewer
    // reasoning from different wording than the client would be reasoning from a different
    // understanding of the match.
    expect(screen.getAllByText('They speak Hindi, one of the languages you chose.')).toHaveLength(
      2,
    );
  });

  it('declares whose voice the evidence is in, because it is not the matcher’s', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    // The evidence is the client's own phrasing — "You said you wanted…" — and on a page
    // about somebody else that second person is genuinely confusing. Rewriting the
    // sentences for an internal reader would mean a second set of templates free to drift
    // from the first, so the voice is declared instead. It also earns its place: a reviewer
    // is being shown exactly what the client will read, word for word.
    const suggestion = screen.getByRole('region', { name: 'What the system suggested' });

    expect(within(suggestion).getByText(/In the client’s words/)).toBeVisible();
    // And said once, on the first card, rather than repeated on every alternative.
    expect(screen.getAllByText(/In the client’s words/)).toHaveLength(1);
  });

  it('shows what a candidate does not carry, because the engine’s evidence only says what they share', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    // Three candidates carry a gap line, and the third is the set-aside one, whose gap is
    // the whole reason it was set aside.
    expect(screen.getAllByText('Not what they offered')).toHaveLength(3);
    // The label is a span inside the line, so the line itself is what carries the answer.
    const gaps = screen
      .getAllByRole('listitem')
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => /^(Work with|Language):/.test(text));

    expect(gaps).toEqual([
      'Work with: Career transitions',
      'Work with: Relationships',
      'Language: Hindi, English',
    ]);
  });

  it('shows the whole profile, so a candidate can be judged rather than trusted', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    // Every attribute a profile page shows, on the same page the client would have seen,
    // for every candidate rather than behind a "see more".
    const suggestion = screen.getByRole('region', { name: 'What the system suggested' });

    for (const label of ['Works with', 'Talks like', 'Approach', 'Experience', 'Sessions']) {
      expect(within(suggestion).getByText(label)).toBeVisible();
    }

    expect(within(suggestion).getByText(/Usually free/)).toBeVisible();
    expect(within(suggestion).getByText(/tuesday 17:00–20:00/)).toBeVisible();
    // The biography, which is the part a matcher reads before deciding somebody is wrong
    // for this person.
    expect(within(suggestion).getByText('A biography.')).toBeVisible();
  });

  it('offers a small set of alternatives and says which cannot be chosen', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const alternatives = screen.getByRole('region', { name: 'Other candidates' });
    const names = within(alternatives)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);

    expect(names).toEqual(['Aditi Raghunathan', 'Ayaan Qureshi', 'Ruth Adeyemi']);

    // The one the engine set aside, and why, and that it is not a choice.
    expect(
      within(alternatives).getByText(/The engine set this one aside: something the client marked/),
    ).toBeVisible();
  });

  it('never offers the engine’s internals', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    // The page says "No scores" once, in reassurance. What must not appear is a *value* —
    // a number beside a candidate, a percentage, or a field name from the engine. So this
    // checks for shapes a leak would take rather than for the word.
    const body = document.body.textContent ?? '';

    expect(body).not.toMatch(/\d+\s*%/);
    expect(body).not.toMatch(/\b(score|rank|weight|ordinal)[:=]\s*\d/i);

    for (const forbidden of [
      'rejection_code',
      'requirement_bonus',
      'feedback_boost',
      'maxCategory',
    ]) {
      expect(body).not.toContain(forbidden);
    }

    // And the one reassurance is the only mention of the word at all.
    expect(body.match(/scores?/gi) ?? []).toHaveLength(1);
  });

  it('never offers a clinical judgement, because there is nowhere to hold one', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const body = (document.body.textContent ?? '').toLowerCase();

    for (const forbidden of [
      'diagnos',
      'severity',
      'risk',
      'personality',
      'condition',
      'clinical',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('has one h1 and a sound heading order', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    expectSoundHeadingStructure();
  });

  it('shows a way forward when the case cannot be read', async () => {
    respondWith = (url) =>
      url.includes('/matching-workspace/cases/')
        ? { status: 404, body: { message: 'no' } }
        : { body: {} };

    renderRoute(workspaceCasePath(MATCH_ID));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the queue' })).toBeVisible();
  });

  it('says it is loading', async () => {
    respondWith = () => ({ body: DETAIL, hold: true });
    renderRoute(workspaceCasePath(MATCH_ID));

    expect(await screen.findByText('Opening the case.')).toBeVisible();
  });
});

describe('the client’s own words', () => {
  it('is not in the payload, and the page says so', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    expect(document.body.textContent).not.toContain('explaining my family');
    // Only one request so far, and it is for the case.
    expect(recorded.filter((entry) => entry.url.includes('matching-workspace'))).toHaveLength(1);
    expect(recorded[0]?.url).not.toContain('clientsWords');
  });

  it('loads on a deliberate act, as a second visible request', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('button', { name: 'Show their own words' }));

    expect(await screen.findByText(/I keep explaining my family/)).toBeVisible();
    expect(screen.getByText(/Too businesslike for me\./)).toBeVisible();

    // The opt-in is a second request carrying the exact word the server accepts.
    const reveal = recorded.find((entry) => entry.url.includes('clientsWords'));
    expect(reveal?.url).toContain('clientsWords=reveal');
  });

  it('says so plainly when there was nothing written', async () => {
    respondWith = (url) =>
      url.includes('clientsWords=reveal')
        ? { body: { ...DETAIL, clientsWords: { intakeNote: null, feedbackNotes: [] } } }
        : { body: DETAIL };

    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('button', { name: 'Show their own words' }));

    expect(
      await screen.findByText('They did not write anything in their own words.'),
    ).toBeVisible();
  });
});

describe('agreeing with the system', () => {
  it('offers the two paths in the same voice, and neither is marked as correct', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const decision = screen.getByRole('region', { name: 'The decision' });

    expect(within(decision).getByRole('radio', { name: /Use this recommendation/ })).toBeVisible();
    expect(within(decision).getByRole('radio', { name: /Aditi Raghunathan/ })).toBeVisible();

    // Neither the button nor the surrounding copy implies one is the default answer.
    const body = decision.textContent ?? '';
    for (const forbidden of ['approve', 'reject', 'override', 'Accept AI', 'Override AI']) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('asks for no reason, because nothing was overridden', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Use this recommendation/ }));

    expect(await screen.findByText('Anything that helped (optional)')).toBeVisible();
    expect(
      screen.getByText(
        'You did not choose a different therapist, so nothing here needs explaining.',
      ),
    ).toBeVisible();

    // And the control is available straight away, with no reason required.
    expect(screen.getByRole('button', { name: 'Record this decision' })).toBeEnabled();
  });

  it('records the choice, and names only the candidate', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Use this recommendation/ }));
    await user.click(screen.getByRole('button', { name: 'Record this decision' }));

    await waitFor(() => {
      expect(recorded.some((entry) => entry.url.includes('/decision'))).toBe(true);
    });

    const posted = recorded.find((entry) => entry.url.includes('/decision'));

    // No client id, no intake id, no therapist id, and no `decisionType` — the server works
    // out from which candidate was named, so a request cannot claim an acceptance was an
    // override.
    expect(posted?.body).toEqual({ selectedMatchId: MATCH_ID, reasons: [] });
  });
});

describe('choosing somebody else', () => {
  it('asks why, and says the reason is what the decision will say about itself', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Aditi Raghunathan/ }));

    expect(await screen.findByText('What made this a better fit')).toBeVisible();
    expect(
      screen.getByText(
        'Choose at least one. This is what the decision will say about itself later.',
      ),
    ).toBeVisible();
  });

  it('will not record an override with no reason', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Aditi Raghunathan/ }));

    const submit = screen.getByRole('button', { name: 'Record this decision' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    // The reason is on the page, not only announced, because most people reading this are
    // not using a screen reader.
    expect(screen.getByText(/Say what made this a better fit/)).toBeVisible();
    expect(submit).toHaveAccessibleDescription(
      screen.getByText(/Say what made this a better fit/).textContent ?? '',
    );

    // And clicking it anyway does nothing. `aria-disabled` alone is a promise the element
    // has to keep, and this is where that promise is tested.
    await user.click(submit);
    expect(recorded.some((entry) => entry.url.includes('/decision'))).toBe(false);
  });

  it('takes several reasons at once, and an optional note', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Aditi Raghunathan/ }));
    await user.click(
      await screen.findByRole('checkbox', { name: /Stronger contextual experience/ }),
    );
    await user.click(screen.getByRole('checkbox', { name: /Better communication style/ }));
    await user.type(screen.getByLabelText(/Anything else/), '  Aditi has lived it.  ');

    await user.click(screen.getByRole('button', { name: 'Record this decision' }));

    await waitFor(() => {
      expect(recorded.some((entry) => entry.url.includes('/decision'))).toBe(true);
    });

    expect(recorded.find((entry) => entry.url.includes('/decision'))?.body).toEqual({
      selectedMatchId: ALTERNATIVE_MATCH_ID,
      reasons: ['stronger-contextual-experience', 'better-communication-style'],
      note: 'Aditi has lived it.',
    });
  });

  it('says the system’s own recommendation stays on the record, once a choice is valid', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Aditi Raghunathan/ }));
    await user.click(
      await screen.findByRole('checkbox', { name: /Stronger contextual experience/ }),
    );

    expect(
      await screen.findByText('The system’s own recommendation stays on the record either way.'),
    ).toBeVisible();
  });

  it('does not offer a candidate the engine set aside, in any form', async () => {
    const user = userEvent.setup();
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    await user.click(screen.getByRole('radio', { name: /Use this recommendation/ }));

    const decision = screen.getByRole('region', { name: 'The decision' });
    const names = within(decision)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-label') ?? radio.textContent ?? '');

    expect(names.join(' ')).not.toContain('Ruth Adeyemi');
  });
});

describe('a case that has been decided', () => {
  it('shows a record rather than a form, and says what the client will be shown', async () => {
    respondWith = () => ({ body: DECIDED });
    renderRoute(workspaceCasePath(MATCH_ID));

    await screen.findByRole('heading', { name: 'Reviewing this case' });

    expect(await screen.findByText('You chose Aditi Raghunathan.')).toBeVisible();
    // The system’s answer is stated plainly and not hidden away.
    expect(screen.getByText(/The system had suggested Tara Joshi/)).toBeVisible();
    expect(screen.getByText(/has not been changed — it is still on the record/)).toBeVisible();
    expect(screen.getByText('Reasons given: stronger contextual experience.')).toBeVisible();
    // In both places the record lives: the decision, and the journey that led to it.
    expect(screen.getAllByText('“Aditi has lived it rather than studied it.”')).toHaveLength(2);
  });

  it('offers no way to change it, because a decision is a record of a moment', async () => {
    respondWith = () => ({ body: DECIDED });
    renderRoute(workspaceCasePath(MATCH_ID));

    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const decision = screen.getByRole('region', { name: 'The decision' });
    expect(within(decision).queryAllByRole('radio')).toHaveLength(0);
    expect(within(decision).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(decision).queryAllByRole('button')).toHaveLength(0);
    expect(within(decision).getByText(/cannot be changed here/)).toBeVisible();
  });

  it('never shows the client what the decision was', async () => {
    respondWith = () => ({ body: DECIDED });
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    // The page says what the client sees and stops there. It is a note to the matcher, and
    // it belongs to the internal surface — no client-facing response has a field any of
    // this could travel in.
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/the client was told|notify the client|send to the client/i);
  });

  it('reports an agreed case as agreement, not as approval of anything', async () => {
    respondWith = () => ({
      body: {
        ...DECIDED,
        decision: {
          ...DECIDED_DECISION,
          decisionType: 'SYSTEM_ACCEPTED',
          selectedMatchId: MATCH_ID,
        },
      },
    });
    renderRoute(workspaceCasePath(MATCH_ID));

    expect(await screen.findByText('You agreed with Tara Joshi.')).toBeVisible();
  });
});

describe('the journey', () => {
  it('shows every search, what the client said, and what was decided', async () => {
    renderRoute(workspaceCasePath(MATCH_ID));
    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const journey = screen.getByRole('region', { name: 'How this got here' });
    expect(within(journey).getByText('First search')).toBeVisible();
    expect(within(journey).getByText('The system suggested Ananya Mehra.')).toBeVisible();
    expect(within(journey).getByText(/The client said it didn’t fit/)).toBeVisible();
    expect(within(journey).getByText('The system suggested Tara Joshi.')).toBeVisible();
    // The pass under review is named rather than inferred.
    expect(within(journey).getByText(/this case/)).toBeVisible();
  });

  it('shows the decision inside the journey too, so the trail reads in one place', async () => {
    respondWith = () => ({ body: DECIDED });
    renderRoute(workspaceCasePath(MATCH_ID));

    await screen.findByRole('heading', { name: 'Reviewing this case' });

    const journey = screen.getByRole('region', { name: 'How this got here' });
    expect(within(journey).getByText('The matcher chose Aditi Raghunathan.')).toBeVisible();
  });
});
