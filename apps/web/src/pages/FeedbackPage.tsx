import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowGlyph } from '../components/ArrowGlyph';
import { Button, ButtonLink } from '../components/Button';
import { ChoiceOption } from '../components/ChoiceOption';
import { Container } from '../components/Container';
import { ErrorNote } from '../components/ErrorNote';
import { Eyebrow } from '../components/Eyebrow';
import { LoadingNote } from '../components/LoadingNote';
import { TextLink } from '../components/TextLink';
import { ToggleAll } from '../components/ToggleAll';
import { fetchFeedbackReasons, submitFeedback } from '../lib/api/feedback';
import type { FeedbackReason } from '../lib/api/types';
import { useApiResource } from '../lib/useApiResource';
import { usePageMeta } from '../lib/usePageMeta';
import { loadMatch } from '../lib/intake/session';
import { paths } from '../routes/paths';
import type { Choice } from '../lib/intake/questions';

/**
 * "Tell us what didn't quite fit."
 *
 * This page has one job and it is delicate, because a page that asks someone to say
 * something did not work is very easily turned into a complaint form. So:
 *
 * - **No red, no stars, no thumbs down, no "reject".** Nothing here is a verdict and
 *   nothing is a rating. The warmest it gets is the same calm rule and tint every other
 *   choice in the intake uses, because a page that looks like a form to fill in is one
 *   people fill in perfunctorily.
 * - **Several reasons are allowed.** "The timing did not work and I did not feel
 *   understood" is one thing someone can mean, and making them pick the half that
 *   mattered more would lose the part that mattered.
 * - **The note is optional and never required.** A required free-text box is a request
 *   to explain yourself, and this is not that. A note on its own is a real answer.
 * - **Nothing is sent until they choose to send it.** The reasons sit in the browser
 *   until then, and a refresh loses them — which is correct for something nobody has
 *   agreed to share yet.
 *
 * The reasons come from the database, so the wording is not this file's to change and
 * the keys the engine matches on are the keys the server actually holds.
 */

/** How many reasons are on screen before the rest are one press away. */
const SHORTLIST = 5;

/** Matches the server's own cap, so a long note is refused here rather than there. */
const NOTE_LIMIT = 2_000;

export function FeedbackPage() {
  const navigate = useNavigate();
  const problemId = useId();
  const noteId = useId();

  // Read once: which recommendation is being talked about, and who it was.
  const [current] = useState(loadMatch);

  const reasons = useApiResource<readonly FeedbackReason[]>(
    (signal) => fetchFeedbackReasons(undefined, { signal }),
    [],
  );

  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  usePageMeta({
    title: 'Tell us what did not fit',
    description: 'What was not right about the person we suggested, and why.',
  });

  if (current === null) {
    return (
      <Frame>
        <NothingToReport />
      </Frame>
    );
  }

  if (reasons.state.status === 'loading') {
    return (
      <Frame>
        <Eyebrow>{current.therapistName}</Eyebrow>
        <LoadingNote>Getting the list ready…</LoadingNote>
      </Frame>
    );
  }

  if (reasons.state.status === 'error') {
    return (
      <Frame>
        <ErrorNote error={reasons.state.error} onRetry={reasons.retry} />
      </Frame>
    );
  }

  const available = reasons.state.data;
  const shown = showAll ? available : available.slice(0, SHORTLIST);

  const toggle = (key: string): void => {
    setChosen((currentChoices) =>
      currentChoices.includes(key)
        ? currentChoices.filter((entry) => entry !== key)
        : [...currentChoices, key],
    );
    setProblem(null);
  };

  const send = async (): Promise<void> => {
    // Guarded here, not only by the button's appearance.
    //
    // The submit control is marked `aria-disabled` while the request is in flight, which
    // is right — it stays focusable and stays announced — but `aria-disabled` is a
    // description, not a mechanism. The native form submit does not consult it, so
    // pressing Enter twice, or clicking twice fast enough to beat the re-render, would
    // send two. The server collapses that to one row, but the page should not be relying
    // on the server to save it from asking twice.
    if (saving) {
      return;
    }

    if (chosen.length === 0 && note.trim() === '') {
      setProblem('Pick a reason, or write a line of your own. Either is enough.');
      return;
    }

    setSaving(true);
    setProblem(null);

    try {
      await submitFeedback(current.matchId, {
        reasons: chosen,
        ...(note.trim() === '' ? {} : { rawText: note.trim() }),
      });

      // Onward to the search, which says what it is doing and then lands on the next
      // recommendation. No page that exists only to announce an intention.
      void navigate(paths.matching);
    } catch {
      // Nothing is lost and nothing has been half-sent: the reasons and the note are
      // still in this tab, and trying again sends the same thing.
      setProblem(
        'We could not save that just now. Nothing you wrote has been lost — it is still on this page.',
      );
      setSaving(false);
    }
  };

  return (
    <Frame>
      <Eyebrow>{current.therapistName}</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">
        Tell us what didn&rsquo;t quite fit.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        Your feedback helps us look for something different next time.
      </p>

      <form
        className="mt-12"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <fieldset aria-describedby={problem === null ? undefined : problemId}>
          <legend className="text-small text-ink-muted max-w-measure text-pretty">
            As many of these as you like, or none of them.
          </legend>

          <div className="mt-7 flex flex-col gap-1">
            {shown.map((reason) => (
              <ChoiceOption
                key={reason.key}
                choice={toChoice(reason)}
                name="reason"
                type="checkbox"
                checked={chosen.includes(reason.key)}
                onChange={() => toggle(reason.key)}
              />
            ))}
          </div>
        </fieldset>

        {available.length > SHORTLIST && (
          <div className="mt-5">
            <ToggleAll
              expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
              label={showAll ? 'Show fewer reasons' : 'Show all reasons'}
              hiddenCount={available.length - SHORTLIST}
            />
          </div>
        )}

        <div className="mt-14">
          <label htmlFor={noteId} className="text-small text-ink-muted block text-pretty">
            Anything else you&rsquo;d like us to know?
          </label>
          <p className="text-small text-ink-faint max-w-measure mt-2 text-pretty">
            Entirely optional. It is kept with what you choose above, and is not read for anything
            else.
          </p>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            maxLength={NOTE_LIMIT}
            className="border-line bg-surface text-body text-ink focus-visible:border-clay-500 rounded-control mt-4 w-full px-4 py-3 text-pretty"
          />
        </div>

        {problem !== null && (
          <p
            id={problemId}
            role="alert"
            className="text-small text-clay-800 max-w-measure mt-8 text-pretty"
          >
            {problem}
          </p>
        )}

        <div className="mt-12 flex flex-col items-start gap-5">
          <Button type="submit" trailing={<ArrowGlyph />} unavailable={saving}>
            Look for someone else
          </Button>
          <TextLink to={paths.recommendation}>Back to {current.therapistName}</TextLink>
        </div>
      </form>
    </Frame>
  );
}

/**
 * A vocabulary entry as a choice.
 *
 * The description goes in the `note` slot rather than being composed here, so the
 * wording is the database's and this file never has to know it.
 */
function toChoice(reason: FeedbackReason): Choice {
  return {
    key: reason.key,
    label: reason.name,
    ...(reason.description === '' ? {} : { note: reason.description }),
  };
}

function NothingToReport() {
  return (
    <>
      <Eyebrow>Nothing to report</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">
        There&rsquo;s no recommendation here to talk about.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        We only ask about a person once we have suggested one. If you have not reached that yet, the
        questions are a good place to start.
      </p>

      <div className="mt-10 flex flex-col items-start gap-5">
        <ButtonLink to={paths.intake}>Start the questions</ButtonLink>
        <TextLink to={paths.home}>Back to the beginning</TextLink>
      </div>
    </>
  );
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">{children}</div>
    </Container>
  );
}
