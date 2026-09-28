import { ArrowGlyph } from '../../components/ArrowGlyph';
import { Button, ButtonLink } from '../../components/Button';
import { Container } from '../../components/Container';
import { IntakeProgress } from '../../components/IntakeProgress';
import { LoadingNote } from '../../components/LoadingNote';
import { QuietButton } from '../../components/QuietButton';
import { TextLink } from '../../components/TextLink';
import { useIntake } from '../../lib/intake/intakeContext';
import { describeSchedule, type IntakeDraft } from '../../lib/intake/draft';
import { draftHasAnswer } from '../../lib/intake/answering';
import {
  labelForKey,
  questionById,
  questionOrder,
  sessionChoiceFor,
  type QuestionId,
} from '../../lib/intake/questions';
import { usePageMeta } from '../../lib/usePageMeta';
import { useNavigate } from 'react-router';
import { intakePath, paths } from '../../routes/paths';

interface SummaryLine {
  readonly id: QuestionId;
  /** What this line is called, in the review's own voice rather than the question's. */
  readonly title: string;
  /** The words, in the order the person chose them. */
  readonly values: readonly string[];
  /** Shown instead of `values` when there is nothing to summarise. */
  readonly empty: string;
}

/**
 * "You told us…"
 *
 * Everything answered, in the words the questions used, each with a way back to
 * it. A summary in database vocabulary would be a different product: this is a
 * person checking that they were heard, not a receipt for a form submission.
 *
 * The primary action is still "Continue" rather than anything that promises a
 * match, because a match does not exist yet and the button should not lie about
 * a feature that a later phase will build.
 */
export function IntakeReviewPage() {
  const { draft, vocabulary, status, saving, saveError, receipt, send, startAgain } = useIntake();
  const navigate = useNavigate();

  usePageMeta({ title: 'Before you send this' });

  if (status === 'sent') {
    return <IntakeConfirmation receiptId={receipt?.intakeId ?? null} onStartAgain={startAgain} />;
  }

  // A review of nothing is not a useful screen, and the two ways to arrive here
  // with an incomplete draft — a direct or shared link to `/intake/review`, and
  // someone who has just started over — both want the same answer: go to the
  // question that still needs an answer.
  const outstanding = firstOutstandingQuestion(draft);

  if (outstanding !== null) {
    return (
      <ReturnToQuestion
        questionId={outstanding}
        onContinue={() => navigate(intakePath(outstanding))}
      />
    );
  }

  if (vocabulary === null) {
    return (
      <Container className="pt-10 pb-6 sm:pt-14">
        <div className="max-w-2xl">
          <LoadingNote>Getting the list ready…</LoadingNote>
        </div>
      </Container>
    );
  }

  const schedule = describeSchedule(draft);
  const sessionChoice = sessionChoiceFor(draft.sessionFormats, vocabulary);

  const lines: readonly SummaryLine[] = [
    {
      id: 'support',
      title: 'Support',
      values: draft.areasOfWork.map((key) => labelForKey('support', key, vocabulary)),
      empty: 'Nothing chosen — you said something else in your own words.',
    },
    {
      id: 'conversation',
      title: 'Conversation',
      values: draft.openToGuidance
        ? ['Not sure yet']
        : draft.communicationStyles.map((key) => labelForKey('conversation', key, vocabulary)),
      empty: 'Nothing chosen yet.',
    },
    {
      id: 'context',
      title: 'Context',
      values: draft.contextualExperiences.map((key) => labelForKey('context', key, vocabulary)),
      empty: 'Nothing specific.',
    },
    {
      id: 'language',
      title: 'Languages',
      values: draft.languages.map((code) => labelForKey('language', code, vocabulary)),
      empty: 'None chosen yet.',
    },
    {
      id: 'sessions',
      title: 'Sessions',
      values: sessionChoice === undefined ? [] : [sessionChoice.label],
      empty: 'Not chosen yet.',
    },
    {
      id: 'availability',
      title: 'Availability',
      values: schedule === null ? [] : [schedule],
      empty: 'No preference shared.',
    },
    {
      id: 'anything-else',
      title: 'In your words',
      values: draft.rawText.trim() === '' ? [] : [draft.rawText.trim()],
      empty: 'You left this blank.',
    },
  ];

  return (
    <Container className="pt-10 pb-6 sm:pt-14">
      <div className="max-w-2xl">
        <IntakeProgress
          current={questionOrder.length + 1}
          total={questionOrder.length + 1}
          question="What you told us"
        />

        <h1 className="font-display text-title mt-10 text-balance">You told us…</h1>

        <p className="text-lead text-ink-muted max-w-measure mt-4 text-pretty">
          Read this back and change anything that is not quite right. Nothing is sent until you
          choose to send it.
        </p>

        <dl className="mt-12">
          {lines.map((line) => (
            <SummaryRow key={line.id} line={line} />
          ))}
        </dl>

        {saveError !== null && (
          <div className="mt-10">
            <p role="alert" className="font-display text-heading text-ink text-balance">
              Something didn&rsquo;t save.
            </p>
            <p className="text-body text-ink-muted mt-3 text-pretty">
              Your answers are still here. Nothing was lost — try again when you&rsquo;re ready.
            </p>
            <p className="mt-5">
              <Button onClick={send} disabled={saving}>
                {saving ? 'Saving what you shared…' : 'Try again'}
                {!saving && <ArrowGlyph />}
              </Button>
            </p>
            <details className="text-micro text-ink-faint mt-6">
              <summary className="cursor-pointer">Technical detail</summary>
              <p className="mt-2">
                {saveError.kind}
                {saveError.status === null ? '' : ` · ${saveError.status}`} · {saveError.detail}
              </p>
            </details>
          </div>
        )}

        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button onClick={send} disabled={saving}>
            {saving ? 'Saving what you shared…' : 'Continue'}
            {!saving && <ArrowGlyph />}
          </Button>

          <TextLink to={intakePath('support')} className="order-last">
            Back to the questions
          </TextLink>
        </div>

        <p className="mt-10">
          <QuietButton onClick={startAgain}>Start over and forget these answers</QuietButton>
        </p>
      </div>
    </Container>
  );
}

/** The first required question still waiting for an answer, if any. */
function firstOutstandingQuestion(draft: IntakeDraft): QuestionId | null {
  for (const id of questionOrder) {
    if (!draftHasAnswer(draft, id)) {
      return id;
    }
  }

  return null;
}

/**
 * A redirect, said out loud.
 *
 * Auto-navigating would be tidier and worse: someone following a link to the
 * review would watch the page change itself with no explanation. One line
 * naming where they are going, and a button, is the honest version.
 */
function ReturnToQuestion({
  questionId,
  onContinue,
}: {
  readonly questionId: QuestionId;
  readonly onContinue: () => void;
}) {
  const question = questionById(questionId);

  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">
        <p className="text-label text-ink-faint uppercase">Not yet</p>

        <h1 className="font-display text-title mt-6 text-balance">
          There is a question to answer first.
        </h1>

        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
          Next is the question: “{question.title}”
        </p>

        <p className="mt-10">
          <Button onClick={onContinue}>
            Go to that question
            <ArrowGlyph />
          </Button>
        </p>
      </div>
    </Container>
  );
}

function SummaryRow({ line }: { readonly line: SummaryLine }) {
  const question = questionById(line.id);

  return (
    <div className="border-line flex flex-col gap-3 border-b py-6 sm:flex-row sm:items-baseline sm:gap-8">
      <dt className="text-label text-ink-muted font-medium uppercase sm:w-40 sm:shrink-0">
        {line.title}
      </dt>

      <dd className="min-w-0 flex-1">
        {line.values.length > 0 ? (
          <>
            <p className="font-display text-subheading text-ink text-pretty">
              {line.values.join(' · ')}
            </p>
            <p className="sr-only">{`${question.title} — ${line.values.join(', ')}.`}</p>
          </>
        ) : (
          <p className="text-body text-ink-faint text-pretty">{line.empty}</p>
        )}

        <p className="mt-2">
          {/*
            "Edit" rather than a link styled as a button, and it goes to the
            question rather than to a form: changing one answer should not mean
            re-entering the flow.
          */}
          <TextLink to={intakePath(line.id)}>Edit</TextLink>
        </p>
      </dd>
    </div>
  );
}

/**
 * "Thank you for sharing."
 *
 * It says what happens next and does not claim a match exists, because one does
 * not. The one honest thing to say about a later phase is that it will use what
 * was shared — so that is what it says.
 */
function IntakeConfirmation({
  receiptId,
  onStartAgain,
}: {
  readonly receiptId: string | null;
  readonly onStartAgain: () => void;
}) {
  usePageMeta({ title: 'Thank you for sharing' });

  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">
        <EyebrowLine>Received</EyebrowLine>

        <h1 className="font-display text-title mt-6 text-balance">Thank you for sharing.</h1>

        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
          Next, we&rsquo;ll use what you&rsquo;ve told us to look for therapists whose experience
          and style may fit what you&rsquo;re looking for.
        </p>

        <p className="text-body text-ink-muted max-w-measure mt-6 text-pretty">
          We compare what you told us against what each therapist has said about their own work. It
          takes a moment, and it is worth waiting for: the reasons matter as much as the person.
        </p>

        {receiptId !== null ? (
          <div className="mt-12 flex flex-col items-start gap-5">
            {/*
              "Who may fit", not "who we found". Nothing has been searched
              yet at this point, so a link promising a specific person would be
              claiming something the page behind it has not done. The hedge is
              also the product's own — the loading copy says the same.
            */}
            <ButtonLink to={paths.recommendation} trailing={<ArrowGlyph />}>
              See who may fit
            </ButtonLink>
            <QuietButton onClick={onStartAgain}>Start again</QuietButton>
            <TextLink to="/">Back to the beginning</TextLink>
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-start gap-5">
            <QuietButton onClick={onStartAgain}>Start again</QuietButton>
            <TextLink to="/">Back to the beginning</TextLink>
          </div>
        )}

        <p className="text-small text-ink-faint mt-10 max-w-md text-pretty">
          Nothing you wrote is kept in your browser now. This is a prototype with no account, so
          there is nothing to log in to and no history to come back to.
        </p>
      </div>
    </Container>
  );
}

function EyebrowLine({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-label text-ink-faint font-medium uppercase">{children}</p>;
}
