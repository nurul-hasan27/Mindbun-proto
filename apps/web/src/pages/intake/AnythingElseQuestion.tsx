import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowGlyph } from '../../components/ArrowGlyph';
import { Button } from '../../components/Button';
import { Container } from '../../components/Container';
import { IntakeProgress } from '../../components/IntakeProgress';
import { TextLink } from '../../components/TextLink';
import { useIntake } from '../../lib/intake/intakeContext';
import { setRawText } from '../../lib/intake/draft';
import {
  previousQuestion,
  questionById,
  questionIndex,
  questionOrder,
} from '../../lib/intake/answering';
import { usePageMeta } from '../../lib/usePageMeta';
import { intakePath, intakeReviewPath } from '../../routes/paths';

/** Long enough for what anyone actually wants to say, short enough to stay a note. */
const MAX_CHARACTERS = 4_000;

/**
 * The last question, and the only one with a keyboard.
 *
 * It is optional, and it says so twice: the explanation, and the skip action.
 * That matters more here than anywhere else in the flow, because this is where
 * someone might type something they later wish they had not — and the interface
 * has a duty to make that easy to avoid.
 *
 * Three promises are made in the copy and kept in the code: the text is never
 * logged, never analysed, and never sent anywhere but the intake endpoint. The
 * draft lives in `sessionStorage`, which ends with the tab.
 */
export function AnythingElseQuestion() {
  const { draft, update, beginReview } = useIntake();
  const navigate = useNavigate();
  const [lengthError, setLengthError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();

  const question = questionById('anything-else');

  usePageMeta({ title: question.title });

  function proceed(): void {
    if (draft.rawText.length > MAX_CHARACTERS) {
      setLengthError(
        `This is a little longer than we can store. ${MAX_CHARACTERS} characters is the most.`,
      );
      textareaRef.current?.focus();

      return;
    }

    setLengthError(null);
    // The last question hands over to the review, which is a step of its own and
    // has its own address.
    beginReview();
    void navigate(intakeReviewPath);
  }

  return (
    <Container className="pt-10 pb-6 sm:pt-14">
      <div className="max-w-2xl">
        <IntakeProgress
          current={questionIndex('anything-else') + 1}
          total={questionOrder.length + 1}
          question={question.title}
        />

        <h1 className="font-display text-title mt-10 text-balance">{question.title}</h1>

        <p className="text-lead text-ink-muted max-w-measure mt-4 text-pretty">
          You can keep this brief. Share only what feels comfortable.
        </p>

        <label htmlFor="intake-anything-else" className="sr-only">
          Anything else you would like us to know
        </label>

        <textarea
          id="intake-anything-else"
          ref={textareaRef}
          value={draft.rawText}
          onChange={(event) => {
            const { value } = event.target;
            update((current) => setRawText(current, value));

            if (value.length > MAX_CHARACTERS) {
              setLengthError(
                `This is a little longer than we can store. ${MAX_CHARACTERS} characters is the most.`,
              );
            } else {
              setLengthError(null);
            }
          }}
          rows={7}
          aria-describedby={
            lengthError === null ? `${errorId}-hint` : `${errorId}-hint ${errorId}-error`
          }
          aria-invalid={lengthError !== null || undefined}
          className="border-line-strong bg-surface text-ink placeholder:text-ink-faint focus:border-clay-400 rounded-panel text-body ease-gentle mt-8 w-full resize-y border px-5 py-4 text-pretty transition-colors duration-200 focus:outline-none"
          placeholder="Whatever you would want someone to read before they meet you."
        />

        <p id={`${errorId}-hint`} className="text-small text-ink-faint mt-3 text-pretty">
          {draft.rawText.length > 0 ? (
            <>
              {draft.rawText.length} characters. This stays in your browser tab, and goes nowhere
              but to the intake when you choose to send it.
            </>
          ) : (
            <>
              Optional. Nothing here is analysed or interpreted in this prototype — it is stored
              with your intake and left alone.
            </>
          )}
        </p>

        {lengthError !== null && (
          <p
            id={`${errorId}-error`}
            role="alert"
            className="text-body text-clay-800 mt-3 text-pretty"
          >
            {lengthError}
          </p>
        )}

        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button onClick={proceed}>
            Review what you told us
            <ArrowGlyph />
          </Button>
          <TextLink
            to={intakePath(previousQuestion('anything-else') ?? 'availability')}
            className="order-last"
          >
            Back
          </TextLink>
        </div>

        <p className="text-small text-ink-faint mt-10 max-w-md text-pretty">
          This is the last question. On the next screen you will be able to read everything back and
          change any of it.
        </p>
      </div>
    </Container>
  );
}
