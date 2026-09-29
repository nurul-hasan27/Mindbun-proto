import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowGlyph } from '../../components/ArrowGlyph';
import { Button } from '../../components/Button';
import { ChoiceOption } from '../../components/ChoiceOption';
import { Container } from '../../components/Container';
import { IntakeProgress } from '../../components/IntakeProgress';
import { LoadingNote } from '../../components/LoadingNote';
import { TextLink } from '../../components/TextLink';
import { useIntake } from '../../lib/intake/intakeContext';
import {
  answer,
  answerChoices,
  draftHasAnswer,
  isDraftEmptyFor,
  isRecorded,
} from '../../lib/intake/answering';
import type { IntakeDraft } from '../../lib/intake/draft';
import {
  nextQuestion,
  previousQuestion,
  questionById,
  questionIndex,
  questionOrder,
  type Choice,
  type QuestionId,
} from '../../lib/intake/questions';
import { usePageMeta } from '../../lib/usePageMeta';
import { intakePath, intakeReviewPath } from '../../routes/paths';

interface IntakeQuestionPageProps {
  readonly questionId: QuestionId;
}

/**
 * The frame every question shares.
 *
 * One question, one short explanation, a set of answers, and two ways onward. The
 * question is the largest thing on the screen and everything else is sized to
 * stay out of its way — that is the whole design, and it is why there are no
 * cards, no step numbers in the body, and no progress bar asking to be watched.
 *
 * Every question page is this file plus a question id, except availability and
 * the closing note, which answer in a shape a list of rows cannot carry.
 */
export function IntakeQuestionPage({ questionId }: IntakeQuestionPageProps) {
  const { vocabulary, draft, beginReview } = useIntake();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const answersRef = useRef<HTMLDivElement>(null);
  const errorId = useId();

  const question = questionById(questionId);
  const earlier = previousQuestion(questionId);
  const ahead = nextQuestion(questionId);

  usePageMeta({ title: question.title });

  function proceed(): void {
    if (!draftHasAnswer(draft, questionId)) {
      // Announced through the alert, and the focus moves to the answers so a
      // keyboard user is already where the fix has to happen.
      setError(MISSING_ANSWER[questionId]);
      answersRef.current?.focus();

      return;
    }

    setError(null);

    if (ahead === null) {
      beginReview();
      void navigate(intakeReviewPath);

      return;
    }

    // A real navigation, so the question has its own address: a refresh returns
    // to the question someone was on, and the browser's back button works.
    void navigate(intakePath(ahead));
  }

  const describedBy = error === null ? undefined : errorId;
  const choices = vocabulary === null ? null : answerChoices(questionId, vocabulary);

  return (
    <Container className="pt-10 pb-6 sm:pt-14">
      <div className="max-w-2xl">
        <IntakeProgress
          current={questionIndex(questionId) + 1}
          total={questionOrder.length + 1}
          question={question.title}
        />

        <h1 className="font-display text-title mt-10 text-balance">{question.title}</h1>

        {question.explanation !== undefined && (
          <p className="text-lead text-ink-muted max-w-measure mt-4 text-pretty">
            {question.explanation}
          </p>
        )}

        {/*
          Focusable so that refusing to continue can move focus here: a keyboard
          user is then already at the answers, which is where the fix has to
          happen. `-1` keeps it out of the tab order — the choices inside are
          what a keyboard tabs through.
        */}
        <div
          ref={answersRef}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={error === null ? -1 : 0}
          className="mt-10 focus:outline-none"
        >
          {error !== null && (
            <p
              id={errorId}
              role="alert"
              className="border-clay-300 text-ink bg-clay-50 text-body mb-6 border-l-2 py-3 pl-4"
            >
              {error}
            </p>
          )}

          {choices === null ? (
            <LoadingNote>Getting the list ready…</LoadingNote>
          ) : (
            <ChoiceList questionId={questionId} choices={choices} describedBy={describedBy} />
          )}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button onClick={proceed}>
            {ahead === null ? 'Review what you told us' : 'Continue'}
            <ArrowGlyph />
          </Button>

          {earlier !== null && (
            <TextLink to={intakePath(earlier)} className="order-last">
              Back
            </TextLink>
          )}
        </div>

        {question.skippable && isDraftEmptyFor(draft, questionId) && (
          <p className="text-small text-ink-faint mt-6 text-pretty">
            This one is optional. You can leave it as it is.
          </p>
        )}

        <p className="text-small text-ink-faint mt-10 max-w-md text-pretty">
          Your answers stay in this browser tab until you choose to send them.
        </p>
      </div>
    </Container>
  );
}

interface ChoiceListProps {
  readonly questionId: QuestionId;
  readonly choices: readonly Choice[];
  readonly describedBy?: string;
}

/**
 * A list of answers as one semantic group.
 *
 * `role="group"` with an accessible name, so a screen reader announces the
 * choices as a set — "exploratory, checkbox, 1 of 6" — rather than as six
 * unrelated controls.
 */
function ChoiceList({ questionId, choices, describedBy }: ChoiceListProps) {
  const { draft, update } = useIntake();
  const single = questionById(questionId).kind === 'single';

  return (
    <div role="group" aria-label={questionById(questionId).title} className="flex flex-col">
      {choices.map((choice) => (
        <ChoiceOption
          key={choice.key ?? choice.code ?? choice.label}
          choice={choice}
          name={questionId}
          type={single ? 'radio' : 'checkbox'}
          checked={isRecorded(questionId, choice, draft)}
          describedBy={describedBy}
          onChange={() => {
            update((current: IntakeDraft) => answer(questionId, choice, current));
          }}
        />
      ))}
    </div>
  );
}

/** Said once, in the product's voice, when someone continues too early. */
const MISSING_ANSWER: Record<QuestionId, string> = {
  support: 'Choose at least one, or tell us in your own words at the last question.',
  conversation: 'Choose at least one, or tell us you are not sure yet.',
  context: '',
  language: 'Choose at least one language.',
  sessions: 'Choose online, in person, or that either is fine.',
  availability: '',
  'anything-else': '',
};
