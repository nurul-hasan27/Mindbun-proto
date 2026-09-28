import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../../test/headingStructure';
import { paths } from '../../routes/paths';
import {
  choose,
  chooseOnly,
  pressContinue,
  renderIntake,
  stubIntakeApi,
  userEvent,
  type StubOptions,
} from '../../test/intakeRender';

let stub: ReturnType<typeof stubIntakeApi>;

function setup(options: StubOptions = {}): void {
  stub = stubIntakeApi(options);
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Answers the four required questions, in the order the flow asks them.
 *
 * The flow's real order is support → conversation → context → language →
 * sessions, so the optional context step is walked through on its way rather than
 * skipped over — which is also a check that Continue works on an optional step.
 */
/**
 * Walks the two optional steps that follow the required ones.
 *
 * Availability's action is "Continue" and the closing note's is "Review what you
 * told us" — the last question is the one that hands over to the review, so
 * reaching the review always takes both.
 */
async function reachReview(): Promise<void> {
  // Walk whatever optional steps are left, then take the closing note's action.
  // Only the last question hands over to the review, so the loop is what makes
  // this work from any question.
  for (let step = 0; step < 8; step += 1) {
    const review = screen.queryByRole('button', { name: 'Review what you told us' });

    if (review !== null) {
      await userEvent.setup().click(review);

      return;
    }

    await pressContinue();
  }

  throw new Error('never reached the review screen');
}

/**
 * The first "Edit" link on the review, which belongs to the first answer listed.
 *
 * Returned rather than asserted inline, so a failure reads as "the review offered
 * no way to edit" instead of being a cast of `undefined`.
 */
function editFirstAnswer(): HTMLElement {
  const link = screen.getAllByRole('link', { name: 'Edit' })[0];

  if (link === undefined) {
    throw new Error('the review offered no way to edit an answer');
  }

  return link;
}

async function answerRequiredQuestions(): Promise<void> {
  await choose('Relationships');
  await pressContinue();

  await choose('helps me explore things');
  await pressContinue();

  await pressContinue();

  await choose('English');
  await pressContinue();

  await chooseOnly('Online');
  await pressContinue();
}

describe('the first question', () => {
  it('asks what someone would like support with, in their words', async () => {
    setup();
    await renderIntake(paths.intake);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'What would you like support with right now?',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/choose as many as apply/i)).toBeInTheDocument();
  });

  it('offers the product wording rather than the vocabulary names', async () => {
    setup();
    await renderIntake(paths.intake);

    const group = screen.getByRole('group', {
      name: 'What would you like support with right now?',
    });

    expect(within(group).getByText('Work or career')).toBeInTheDocument();
    expect(within(group).getByText('Feeling overwhelmed')).toBeInTheDocument();
    expect(within(group).queryByText('Burnout')).not.toBeInTheDocument();
    expect(within(group).queryByText('Career transitions')).not.toBeInTheDocument();
  });

  it('names the part of the flow rather than repeating the question above itself', async () => {
    setup();
    await renderIntake(paths.intake);

    expect(screen.getByText(/getting to know what matters/i)).toBeInTheDocument();
    expect(
      screen.getByText(/step 1 of 8: what would you like support with right now\?/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/step 4 of 17/i)).not.toBeInTheDocument();
  });

  it('says "before you finish" on the review, not a question', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    expect(screen.getByText(/before you finish/i)).toBeInTheDocument();
  });

  it('never uses the language of a clinical questionnaire', async () => {
    setup();
    await renderIntake(paths.intake);

    const page = document.body.textContent ?? '';

    for (const word of [/symptom/i, /diagnos/i, /disorder/i, /\bpatient\b/i, /assessment/i]) {
      expect(page, word.source).not.toMatch(word);
    }
  });

  it('has one h1 and a sound heading structure', async () => {
    setup();
    await renderIntake(paths.intake);

    expectSoundHeadingStructure();
  });
});

describe('choosing answers', () => {
  it('lets someone choose more than one, and shows both as chosen', async () => {
    setup();
    await renderIntake(paths.intake);

    await choose('Relationships');
    await choose('Family');

    expect(screen.getByRole('checkbox', { name: /Relationships/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Family/ })).toBeChecked();
  });

  it('marks a chosen answer visibly, not only in colour', async () => {
    setup();
    const { container } = await renderIntake(paths.intake);

    const before = container.querySelectorAll('[data-checked="true"]').length;
    await choose('Relationships');
    const after = container.querySelectorAll('[data-checked="true"]').length;

    expect(after).toBe(before + 1);
  });

  it('lets someone take an answer back', async () => {
    setup();
    await renderIntake(paths.intake);

    await choose('Relationships');
    await choose('Relationships');

    expect(screen.getByRole('checkbox', { name: /Relationships/ })).not.toBeChecked();
  });

  it('asks a single-answer question as a radio, so only one can be chosen', async () => {
    setup();
    await renderIntake(`${paths.intake}/sessions`);

    expect(screen.getByRole('radio', { name: 'Online' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'In person' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('records "either is fine" as both formats, not as nothing', async () => {
    setup();
    // From the beginning: a review needs all four required answers, and this is
    // about how "either" survives to the summary rather than about the sessions
    // step on its own.
    await renderIntake(paths.intake);

    await choose('Relationships');
    await pressContinue();
    await choose('helps me explore things');
    await pressContinue();
    await pressContinue();
    await choose('English');
    await pressContinue();
    await chooseOnly('Either is fine');
    await reachReview();

    expect(screen.getByText('Either is fine')).toBeInTheDocument();
  });
});

describe('the conversation question', () => {
  it('offers choices in plain language, with an honest way out', async () => {
    setup();
    await renderIntake(`${paths.intake}/conversation`);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'What kind of conversation feels most helpful?',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I’m not sure yet/ })).toBeInTheDocument();
    expect(screen.queryByText('Exploratory')).not.toBeInTheDocument();
  });

  it('replaces named styles with "not sure yet" rather than keeping both', async () => {
    setup();
    await renderIntake(`${paths.intake}/conversation`);

    await choose('helps me explore things');
    expect(screen.getByRole('checkbox', { name: /helps me explore things/ })).toBeChecked();

    await choose('I’m not sure yet');

    expect(screen.getByRole('checkbox', { name: /helps me explore things/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /I’m not sure yet/ })).toBeChecked();
  });

  it('treats "not sure yet" as a complete answer', async () => {
    setup();
    await renderIntake(`${paths.intake}/conversation`);

    await choose('I’m not sure yet');
    await pressContinue();

    expect(
      screen.getByRole('heading', { level: 1, name: /What matters to you/ }),
    ).toBeInTheDocument();
  });
});

describe('the optional questions', () => {
  it('says a question is optional before it is asked', async () => {
    setup();
    await renderIntake(`${paths.intake}/context`);

    expect(screen.getByText(/this one is optional/i)).toBeInTheDocument();
  });

  it('lets someone move on without answering an optional question', async () => {
    setup();
    await renderIntake(`${paths.intake}/context`);

    await pressContinue();

    expect(screen.getByRole('heading', { level: 1, name: /What language/ })).toBeInTheDocument();
  });

  it('never blocks on the closing note', async () => {
    setup();
    await renderIntake(`${paths.intake}/anything-else`);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Review what you told us' }));

    // Nothing else has been answered here, so the review says what is missing
    // rather than pretending there is a summary to read.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /there is a question to answer first/i }),
      ).toBeInTheDocument();
    });
  });

  it('explains that the closing note is not analysed or sent anywhere else', async () => {
    setup();
    await renderIntake(`${paths.intake}/anything-else`);

    expect(
      screen.getByText(/optional\. nothing here is analysed or interpreted/i),
    ).toBeInTheDocument();
  });
});

describe('required answers', () => {
  it('will not continue past a required question, and says why in plain words', async () => {
    setup();
    await renderIntake(paths.intake);

    await pressContinue();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/choose at least one/i);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'What would you like support with right now?',
      }),
    ).toBeInTheDocument();
  });

  it('moves focus to the answers when it refuses to continue', async () => {
    setup();
    await renderIntake(paths.intake);

    await pressContinue();

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('group', { name: 'What would you like support with right now?' })
          .parentElement,
      );
    });
  });

  it('moves on once something is chosen', async () => {
    setup();
    await renderIntake(paths.intake);

    await choose('Relationships');
    await pressContinue();

    expect(
      screen.getByRole('heading', { level: 1, name: /What kind of conversation/ }),
    ).toBeInTheDocument();
  });
});

describe('the closing note', () => {
  it('accepts what someone types and keeps it', async () => {
    setup();
    await renderIntake(`${paths.intake}/anything-else`);

    const textarea = screen.getByLabelText(/anything else/i);
    await userEvent.setup().type(textarea, 'I have a lot on at the moment.');

    expect(textarea).toHaveValue('I have a lot on at the moment.');
  });

  it('refuses more than it can store, and says how much is too much', async () => {
    setup();
    await renderIntake(`${paths.intake}/anything-else`);

    const textarea = screen.getByLabelText(/anything else/i);
    await userEvent.setup().click(textarea);
    await userEvent.setup().paste('a'.repeat(4_001));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/4000 characters/i);
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('navigating the flow', () => {
  it('goes forwards one question at a time', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();

    expect(
      screen.getByRole('heading', { level: 1, name: /When would sessions usually work/ }),
    ).toBeInTheDocument();
  });

  it('goes backwards without losing an answer', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Back' }));

    expect(
      screen.getByRole('heading', { level: 1, name: /How would you prefer/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Online' })).toBeChecked();
  });

  it('never shows a Back link on the first question', async () => {
    setup();
    await renderIntake(paths.intake);

    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('can be opened directly at any question', async () => {
    setup();
    await renderIntake(`${paths.intake}/context`);

    expect(
      screen.getByRole('heading', { level: 1, name: /What matters to you/ }),
    ).toBeInTheDocument();
  });

  it('reaches the review after the last question', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await pressContinue();

    expect(screen.getByRole('heading', { level: 1, name: /anything else/i })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Review what you told us' }));

    expect(screen.getByRole('heading', { level: 1, name: 'You told us…' })).toBeInTheDocument();
  });

  it('calls the last step review rather than continue, because review is its own step', async () => {
    setup();
    await renderIntake(`${paths.intake}/anything-else`);

    expect(screen.getByRole('button', { name: 'Review what you told us' })).toBeInTheDocument();
  });
});

describe('the review', () => {
  it('summarises the answers in the words the questions used', async () => {
    setup();
    await renderIntake(paths.intake);

    // Answer the context question while actually on it, rather than trying to
    // reach back into a step the flow has already passed.
    await choose('Relationships');
    await pressContinue();

    await choose('helps me explore things');
    await pressContinue();

    await choose('Someone familiar with Indian family dynamics');
    await pressContinue();

    await choose('English');
    await pressContinue();

    await chooseOnly('Online');
    await reachReview();

    expect(screen.getByText('You told us…')).toBeInTheDocument();
    expect(screen.getByText('Relationships')).toBeInTheDocument();
    expect(screen.getByText('Someone who helps me explore things')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Someone familiar with Indian family dynamics')).toBeInTheDocument();
  });

  it('says plainly what was left out', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    expect(screen.getByText('No preference shared.')).toBeInTheDocument();
    expect(screen.getByText('You left this blank.')).toBeInTheDocument();
  });

  it('offers a way back to each answer, and the edit really changes it', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    await userEvent.setup().click(editFirstAnswer());

    expect(
      screen.getByRole('heading', { level: 1, name: /What would you like support with/ }),
    ).toBeInTheDocument();

    await choose('Work or career');
    await reachReview();

    // The summary joins chosen answers into one line, so the whole line is what
    // is asserted: adding an answer appends to it rather than adding a row.
    expect(screen.getByText(/^Relationships · Work or career$/)).toBeInTheDocument();
  });

  it('takes an answer back when it is unchosen on the way to the review', async () => {
    setup();
    await renderIntake(paths.intake);

    await choose('Relationships');
    await choose('Family');
    await pressContinue();
    await choose('helps me explore things');
    await pressContinue();
    await pressContinue();
    await choose('English');
    await pressContinue();
    await chooseOnly('Online');
    await reachReview();

    expect(screen.getByText(/Relationships · Family/)).toBeInTheDocument();

    await userEvent.setup().click(editFirstAnswer());
    await choose('Family');
    await reachReview();

    expect(screen.getByText(/^Relationships$/)).toBeInTheDocument();
    expect(screen.queryByText(/Family/)).not.toBeInTheDocument();
  });

  it('sends someone straight to the first unanswered question', async () => {
    setup();
    // Language and sessions deliberately left blank, so the review has something
    // outstanding to report.
    const { router } = await renderIntake(paths.intake);

    await choose('Relationships');
    await pressContinue();
    await choose('helps me explore things');
    await pressContinue();
    await pressContinue();

    // Arriving at the review directly, as a shared or refreshed link would.
    await router.navigate(`${paths.intake}/review`);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /there is a question to answer first/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/What language would you feel most comfortable speaking/),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /go to that question/i }));

    expect(
      screen.getByRole('heading', { level: 1, name: /What language would you feel/ }),
    ).toBeInTheDocument();
  });

  it('never shows an internal identifier', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    const page = document.body.textContent ?? '';

    expect(page).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(page).not.toMatch(/career-transitions|communicationStyles|rawText/);
  });

  it('does not promise a match', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /find|submit|generate match/i }),
    ).not.toBeInTheDocument();
  });
});

describe('sending', () => {
  it('shows a quiet saving state rather than a spinner', async () => {
    setup({ holdSubmit: true });
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving what you shared/i })).toBeDisabled();
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('posts a payload with the structured answers in it', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    await waitFor(() => expect(stub.requests).toHaveLength(1));

    const body = stub.requests[0]?.body as Record<string, unknown>;

    expect(body['areasOfWork']).toEqual(['relationships']);
    expect(body['communicationStyles']).toEqual(['exploratory']);
    expect(body['languages']).toEqual(['en']);
    expect(body['sessionFormats']).toEqual(['online']);
    expect(body['openToGuidance']).toBe(false);
    expect(body['sessionId']).toEqual(expect.any(String));
    expect(body['submissionId']).toEqual(expect.any(String));
  });

  it('confirms warmly, and does not claim a match exists', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Thank you for sharing.' }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/use what you’ve told us to look for therapists/i)).toBeInTheDocument();
    expect(screen.getByText(/not built yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/we found|your match|matched you/i)).not.toBeInTheDocument();
  });

  it('forgets the draft once it has been sent', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    await waitFor(() => {
      expect(sessionStorage.getItem('wtm.intake.draft.v1')).toBeNull();
    });
  });

  it('keeps the answers and offers another try when saving fails', async () => {
    setup({ failSubmit: true });
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/something didn’t save/i);
    expect(screen.getByText(/your answers are still here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    // The draft is intact, so a retry uses it as it is.
    const body = JSON.parse(sessionStorage.getItem('wtm.intake.draft.v1') ?? '{}') as {
      areasOfWork?: string[];
    };
    expect(body.areasOfWork).toEqual(['relationships']);
  });

  it('never shows a technical message about a failed save', async () => {
    setup({ failSubmit: true });
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();
    await userEvent.setup().click(screen.getByRole('button', { name: /^Continue$/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent(/503|statuscode|http/i);
  });
});

describe('an unfinished intake and a refresh', () => {
  it('keeps answers in session storage as they are given', async () => {
    setup();
    await renderIntake(paths.intake);

    await choose('Relationships');

    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('wtm.intake.draft.v1') ?? '{}') as {
        areasOfWork?: string[];
      };
      expect(stored.areasOfWork).toEqual(['relationships']);
    });
  });

  it('restores answers after the tab is reloaded', async () => {
    setup();
    const { unmount } = await renderIntake(paths.intake);

    await choose('Relationships');
    await choose('Life changes');
    await pressContinue();
    await choose('helps me explore things');

    // What a refresh does: the component tree goes, the session storage does not.
    unmount();
    await renderIntake(`${paths.intake}/conversation`);

    expect(screen.getByRole('checkbox', { name: /helps me explore things/ })).toBeChecked();
  });

  it('never uses local storage, so a draft cannot outlive the tab', async () => {
    setup();
    await renderIntake(paths.intake);

    await choose('Relationships');

    expect(localStorage.length).toBe(0);
  });

  it('forgets everything when someone starts over', async () => {
    setup();
    await renderIntake(paths.intake);

    await answerRequiredQuestions();
    await reachReview();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /start over and forget these answers/i }));

    // The review is gone, and the review screen now says there is a question to
    // answer first — which is the honest thing for it to show.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /there is a question to answer first/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('You told us…')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('wtm.intake.draft.v1')).toBeNull();
    expect(sessionStorage.getItem('wtm.intake.session.v1')).toBeNull();
    expect(sessionStorage.getItem('wtm.intake.submission.v1')).toBeNull();
  });
});

describe('when the questions cannot be loaded', () => {
  it('says so quietly, and does not offer a broken list', async () => {
    setup({ vocabularyStatus: 503, vocabulary: { message: 'unavailable' } });
    await renderIntake(paths.intake);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('tells someone their answers are not lost', async () => {
    setup({ vocabularyStatus: 503, vocabulary: { message: 'unavailable' } });
    await renderIntake(paths.intake);

    expect(
      await screen.findByText(/nothing you have already answered has been lost/i),
    ).toBeInTheDocument();
  });
});
