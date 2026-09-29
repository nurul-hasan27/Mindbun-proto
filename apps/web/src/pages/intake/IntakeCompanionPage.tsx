import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Container } from '../../components/Container';
import { Eyebrow } from '../../components/Eyebrow';
import { LoadingNote } from '../../components/LoadingNote';
import { QuietButton } from '../../components/QuietButton';
import { TextLink } from '../../components/TextLink';
import { GuidedJourney } from '../../components/intake/GuidedJourney';
import { Notepaper } from '../../components/intake/Notepaper';
import { ReflectionJournal } from '../../components/intake/ReflectionJournal';
import {
  ReflectedUnderstanding,
  type SuggestionVerdict,
} from '../../components/intake/ReflectedUnderstanding';
import {
  requestAiExtraction,
  requestAiTurn,
  type AiMessage,
  type AiSuggestion,
} from '../../lib/api/ai';
import { isApiError, toApiError, type ApiError } from '../../lib/api/errors';
import { useIntake } from '../../lib/intake/intakeContext';
import { applyAvailabilityHint, applySuggestion } from '../../lib/intake/suggestions';
import {
  appendMessage,
  clearConversation,
  loadConversation,
  saveConversation,
} from '../../lib/intake/conversation';
import { promptsAreUseful, stageFor } from '../../lib/intake/journal';
import { cx } from '../../lib/cx';
import { usePageMeta } from '../../lib/usePageMeta';
import { intakePath, paths } from '../../routes/paths';

/**
 * The intake companion.
 *
 * ## It is a step in the intake, not a feature beside it
 *
 * A route in the intake tree, with the same header, the same measure, and a way onward into
 * the ordinary questions. There is no launcher, no bubble, and no way to open it from the
 * recommendation page — because a chatbot you can summon anywhere is a different product,
 * and a worse one: the questions are already here, and they do the same job.
 *
 * ## What it may and may not do
 *
 * It interprets and it suggests. It cannot write: `applySuggestion` goes through the same
 * `toggle*` functions the questions use, one kept suggestion at a time, on a page where every
 * one of them can be seen and undone. There is no call anywhere on this page that stores
 * anything, so "the assistant filled in my intake" is not a thing that can happen.
 *
 * ## It runs only when someone does something
 *
 * One request per sent message, one per explicit request for suggestions. Nothing on render,
 * nothing on a keystroke, no effect that fires on mount except the greeting — which is
 * rendered locally, so the page works with the network switched off.
 *
 * ## The fallback is a first-class path
 *
 * If the assistant is switched off, has failed, or has simply ended the conversation, the
 * questions are one link away and the draft is untouched. The prototype is fully usable with
 * no AI at all, which is both the requirement and the honest position: this is an
 * interpreter, not a dependency.
 */
export function IntakeCompanionPage() {
  usePageMeta({
    title: 'Tell us in your own words',
    description:
      'Write what is going on in your own words, and check what we understood before anything is saved.',
  });

  const { draft, update, vocabulary } = useIntake();
  const navigate = useNavigate();

  /*
   * The greeting, rendered locally rather than requested.
   *
   * Two reasons, and the second is the one that decided it. A person should not wait on a
   * network round trip to be invited to speak — and the page must work at all when there is
   * no assistant, so a request would be the wrong shape for this message even if it were
   * fast.
   *
   * Seeded into the initial state rather than pushed by an effect, because an effect that
   * calls `setState` on mount costs an extra render for a value that was already known when
   * the page was created. It is also plain text this file owns, so a reviewer can read
   * exactly what the product says on arrival without running anything.
   */
  const [messages, setMessages] = useState<readonly AiMessage[]>(() => {
    const saved = loadConversation();

    return saved.length > 0 ? saved : [{ role: 'assistant', text: GREETING }];
  });
  const [pending, setPending] = useState(false);
  const [turnError, setTurnError] = useState<ApiError | null>(null);
  const [extractError, setExtractError] = useState<ApiError | null>(null);
  const [suggestions, setSuggestions] = useState<readonly AiSuggestion[] | null>(null);
  const [notUnderstood, setNotUnderstood] = useState<readonly { category: string; key: string }[]>(
    [],
  );
  const [surplus, setSurplus] = useState<readonly { category: string; key: string }[]>([]);
  const [verdicts, setVerdicts] = useState<Readonly<Record<string, SuggestionVerdict>>>({});
  const [unavailable, setUnavailable] = useState(false);
  // How much of the transcript a screen reader has been told. One from the start, because
  // the greeting is on the page when the route opens and is read in the visual order.
  const [announcedUpTo, setAnnouncedUpTo] = useState(1);

  const inFlight = useRef<AbortController | null>(null);

  const remember = useCallback((next: readonly AiMessage[]) => {
    setMessages(next);
    saveConversation(next);
  }, []);

  // Abandoned on unmount and whenever a newer request starts, so a slow reply for an earlier
  // message can never overwrite the one that was actually asked for.
  useEffect(() => () => inFlight.current?.abort(), []);

  const known = useMemo(
    () => ({
      areasOfWork: draft.areasOfWork,
      communicationStyles: draft.communicationStyles,
      openToGuidance: draft.openToGuidance,
      contextualExperience: draft.contextualExperiences,
      languages: draft.languages,
      sessionFormats: draft.sessionFormats,
      hasAvailability: draft.days.length > 0 || draft.timeOfDay.length > 0,
      hasFreeText: draft.rawText.trim() !== '',
    }),
    [draft],
  );

  const send = useCallback(
    (text: string) => {
      // Named for what it is: one turn, appended to what came before.
      const transcript = appendMessage(messages, { role: 'user', text });

      remember(transcript);
      setPending(true);
      setTurnError(null);

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      requestAiTurn(transcript, known, undefined, { signal: controller.signal }).then(
        (turn) => {
          if (controller.signal.aborted) {
            return;
          }

          const next = appendMessage(transcript, { role: 'assistant', text: turn.reply });
          remember(next);
          // Announced once the whole turn is on the page, so a screen reader does not
          // announce the question and then the answer as two separate events.
          setAnnouncedUpTo(transcript.length - 1);
          setPending(false);
          // Two different things are true after a guard reply and the interface must not
          // conflate them. A request for care gets a redirect, and the conversation can carry
          // on afterwards — a person can still say what they are looking for. A mention of
          // self-harm ends it, because the honest response to that is not to keep matching
          // somebody to them.
          setUnavailable(GUARD_ENDS.test(turn.reply));
        },
        (reason: unknown) => {
          if (controller.signal.aborted || (isApiError(reason) && reason.kind === 'aborted')) {
            return;
          }

          setTurnError(toApiError(reason));
          setPending(false);
        },
      );
    },
    [known, messages, remember],
  );

  const askForSuggestions = useCallback(() => {
    if (messages.every((message) => message.role === 'assistant')) {
      return;
    }

    setPending(true);
    setExtractError(null);

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    requestAiExtraction(messages, undefined, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) {
          return;
        }

        setSuggestions(result.suggestions);
        setNotUnderstood(result.notUnderstood);
        setSurplus(result.surplus);
        setVerdicts({});
        setPending(false);
      },
      (reason: unknown) => {
        if (controller.signal.aborted || (isApiError(reason) && reason.kind === 'aborted')) {
          return;
        }

        setExtractError(toApiError(reason));
        setPending(false);
      },
    );
  }, [messages]);

  const keep = useCallback(
    (suggestion: AiSuggestion) => {
      const result = applySuggestion(draft, suggestion);
      setVerdicts((current) => ({
        ...current,
        [`${suggestion.category}:${suggestion.key}`]: 'kept',
      }));

      if (result.ok && result.draft !== draft) {
        update(() => result.draft);
      }
    },
    [draft, update],
  );

  const reject = useCallback((suggestion: AiSuggestion) => {
    setVerdicts((current) => ({
      ...current,
      [`${suggestion.category}:${suggestion.key}`]: 'rejected',
    }));
  }, []);

  const change = useCallback(
    (suggestion: AiSuggestion) => {
      // Navigating to the question that would adjust it. Marked kept on the way out, because
      // arriving at a question with a value already selected would be the assistant having
      // answered it.
      const result = applySuggestion(draft, suggestion);

      if (result.ok && result.draft !== draft) {
        update(() => result.draft);
      }

      const question = questionFor(suggestion);
      void navigate(question === null ? intakePath('support') : intakePath(question));
    },
    [draft, navigate, update],
  );

  const startOver = useCallback(() => {
    inFlight.current?.abort();
    clearConversation();
    setMessages([]);
    setSuggestions(null);
    setNotUnderstood([]);
    setSurplus([]);
    setVerdicts({});
    setTurnError(null);
    setExtractError(null);
    setAnnouncedUpTo(1);
    setUnavailable(false);
  }, []);

  const applyHint = useCallback(
    (suggestion: AiSuggestion) => {
      const target = suggestion.target;

      if (target.kind === 'availabilityHint') {
        update((current) => applyAvailabilityHint(current, target));
      }
    },
    [update],
  );

  const keptCount = Object.values(verdicts).filter((verdict) => verdict === 'kept').length;
  const hintSuggestions =
    suggestions?.filter((entry) => entry.target.kind === 'availabilityHint') ?? [];

  /*
   * The stage, derived from what has been understood rather than counted.
   *
   * `stageFor` reads the transcript, so a person who writes one long answer and a person who
   * writes four short ones are not treated differently. The stage follows the only thing the
   * next step actually depends on.
   */
  const stage = stageFor({ messages, showingUnderstanding: suggestions !== null });

  return (
    <section className="wash-quiet">
      <Container className="pt-8 pb-16 sm:pt-12 lg:pt-16">
        {/*
          Three columns, and not centred.

          The left rail carries where you are and nothing else. The middle is the only thing
          that moves. The right carries what happens to this, and is the one part that is
          genuinely optional to look at. A single centred column would be the same page with
          the context removed — which is precisely the shape a chat interface uses, and
          precisely why this does not.

          `minmax(0, 33rem)` rather than a fixed width so the prose column can be narrower
          than its maximum without the rails closing over it, and the third track takes the
          slack, which leaves the whole composition sitting slightly left of centre.
        */}
        <div className="lg:grid lg:grid-cols-[12rem_minmax(0,33rem)_minmax(14rem,1fr)] lg:gap-12 xl:gap-16">
          {/* Left: the journey. Hidden rather than reflowed — a sidebar of stage names
              beside a page of prose competes with the prose. */}
          <div className="hidden lg:block">
            <GuidedJourney current={stage} variant="rail" />
          </div>

          <div className="min-w-0">
            {/* The same rail, as a row, for every width that cannot afford the column. */}
            <GuidedJourney current={stage} variant="row" className="mb-10 lg:hidden" />

            <header>
              <Eyebrow>Optional · before the questions</Eyebrow>

              {/*
                The opening is a page title, not a message. There is no "Hi, I'm an
                assistant" and no product announcing itself, because the first thing a
                person meets here should be a thought about their own situation rather than
                a piece of software introducing itself.
              */}
              <h1 className="font-display text-title mt-6 text-balance">
                Let’s start somewhere simple.
              </h1>

              {/*
                The lead says only what the page itself can say, which is what *this* is
                rather than what the conversation is about. The "you don't need the
                vocabulary" line belongs to the assistant, and belongs once — having it here
                too put two near-identical sentences in the first screenful, one of them a
                page talking and one of them the page asking.
              */}
              <p className="text-lead text-ink-muted max-w-measure mt-5 text-pretty">
                Nothing here is decided for you. Take as long as you like, stop whenever you want,
                and change anything later.
              </p>
            </header>

            {/* The page: what was asked, what was written, what was heard back. */}
            <div className="mt-12">
              <ReflectionJournal messages={messages} announcedUpTo={announcedUpTo} />
            </div>

            {pending && (
              <div className="mt-8">
                <LoadingNote>Making sense of that.</LoadingNote>
              </div>
            )}

            {turnError !== null && (
              <TurnError error={turnError} onRetry={() => setTurnError(null)} />
            )}

            {unavailable ? (
              <EndedNote onContinue={() => void navigate(intakePath('support'))} />
            ) : (
              <Notepaper
                className="mt-12"
                onContinue={send}
                disabled={pending}
                showStarters={promptsAreUseful(messages, '')}
                guidance={
                  turnError === null ? null : 'What you wrote is still here. Try sending it again.'
                }
              />
            )}

            {/*
              The offer to read it back is a line of text with a word in it, not a step. The
              interface deciding somebody has said enough — after two messages, say — would
              interrupt exactly the moment somebody has just found the right words.
            */}
            {!unavailable && messages.some((message) => message.role === 'user') && (
              <div className="mt-10">
                <p className="text-small text-ink-muted max-w-measure text-pretty">
                  {suggestions === null
                    ? 'When you feel you have said enough, we can read it back as answers to the questions.'
                    : suggestions.length === 0
                      ? 'There was nothing in that we could place against the questions. The questions themselves may serve you better.'
                      : 'Here is what we understood. Does that sound right?'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                  <QuietButton onClick={askForSuggestions} disabled={pending}>
                    {suggestions === null ? 'Show me what you understood' : 'Read it again'}
                  </QuietButton>
                  <TextLink to={intakePath('support')}>Answer the questions myself</TextLink>
                </div>

                {extractError !== null && (
                  // A `div`, because `QuietButton` renders a button and a button inside a
                  // paragraph is invalid HTML — which React warns about now and which would
                  // be a hydration error in a future that hydrates this page.
                  <div className="text-small text-clay-700 mt-4" role="alert">
                    <p>
                      Something went wrong while reading that back. What you wrote is still here.
                    </p>{' '}
                    <QuietButton onClick={askForSuggestions}>Try again</QuietButton>
                  </div>
                )}
              </div>
            )}

            {suggestions !== null && (
              <div className="arrive-understanding mt-14">
                <h2 className="font-display text-heading text-ink">
                  {suggestions.length === 0 ? 'What we could place' : 'What we understood'}
                </h2>

                <p className="text-small text-ink-muted max-w-measure mt-3 text-pretty">
                  Nothing has been saved yet. Keep what is right, or answer the questions yourself —
                  either way, you decide.
                </p>

                <ReflectedUnderstanding
                  className="mt-8"
                  suggestions={suggestions}
                  verdicts={verdicts}
                  onKeep={keep}
                  onReject={reject}
                  onChange={change}
                  draft={draft}
                />

                {/*
                  Shown whatever the list holds. Somebody who said something we could not
                  place, and got nothing back, needs to be told *that* — it is the most
                  useful sentence on the page for them, and burying it inside a block that
                  only appears with results would lose exactly those people.
                */}
                <UnplacedNotes
                  className="mt-8"
                  notUnderstood={notUnderstood}
                  surplus={surplus}
                  vocabulary={vocabulary}
                />

                {hintSuggestions.length > 0 && (
                  <AvailabilityHints suggestions={hintSuggestions} onApply={applyHint} />
                )}

                {/*
                  Loud when there is something to carry forward, quiet when there is not.

                  A filled clay button is the strongest mark in the product, and spending it
                  on *leaving* told a person who had just been understood that the way out
                  mattered more than what they had understood. The reward gets the weight;
                  the fallback gets a link, which is also what it is.
                */}
                <div className="mt-10 flex flex-col items-start gap-4">
                  {keptCount > 0 ? (
                    <ButtonLink to={intakePath('support')}>Continue with these</ButtonLink>
                  ) : (
                    <TextLink to={intakePath('support')}>Answer the questions yourself</TextLink>
                  )}
                  <QuietButton onClick={startOver}>Start again</QuietButton>
                </div>
              </div>
            )}

            {/*
              The way out is always here, and it is the primary action whenever nothing
              usable has come of the conversation. A companion that trapped somebody would be
              a worse intake than the one it replaced.
            */}
            <div className="border-line mt-14 border-t pt-8">
              <h2 className="text-label text-ink-muted uppercase">Or go to the questions</h2>
              <p className="text-small text-ink-muted max-w-measure mt-3 text-pretty">
                Seven short questions, one at a time. Anything understood above is already filled
                in, and you can change all of it.
              </p>
              <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
                <TextLink to={intakePath('support')}>The questions</TextLink>
                <TextLink to={paths.start}>Back to the start</TextLink>
              </p>
            </div>
          </div>

          {/*
            Right: what happens to this. The one part of the page that is genuinely
            secondary, so it is the part that is smallest, quietest, and last in the reading
            order on a narrow screen. Reassurance nobody can act on is noise; this is
            reassurance that answers the question somebody actually has here, which is
            whether this is going somewhere or into a void.
          */}
          <aside className="mt-14 lg:sticky lg:top-28 lg:mt-32 lg:self-start">
            <h2 className="text-label text-ink-faint font-medium uppercase">What happens here</h2>

            <div className="text-small text-ink-muted mt-4 flex flex-col gap-4 text-pretty">
              <p>
                Nothing is saved while you write. What we understand becomes answers to the
                questions, and you can change any of them before anything is sent.
              </p>
              <p>
                This is not a clinical assessment and nothing here is a diagnosis. It is a way of
                getting what you need in front of the right person.
              </p>
            </div>

            <div aria-hidden="true" className="bg-clay-300 mt-8 h-px w-8" />
          </aside>
        </div>
      </Container>
    </section>
  );
}

/** The failure state, in the product's voice rather than the browser's. */
function TurnError({ error, onRetry }: { readonly error: ApiError; readonly onRetry: () => void }) {
  const unavailable = error.status === 503;

  return (
    <div className="mt-10" role="alert">
      <p className="text-body text-ink text-pretty">
        {unavailable
          ? 'The conversation is switched off.'
          : 'Something went wrong while interpreting that.'}
      </p>
      <p className="text-small text-ink-muted mt-2 text-pretty">
        {unavailable
          ? 'That is okay. You can carry on without it — the way into the questions is at the foot of this page.'
          : 'Your words are still here, and so is the way into the questions.'}
      </p>

      {!unavailable && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
          <QuietButton onClick={onRetry}>Try again</QuietButton>
        </div>
      )}
    </div>
  );
}

/**
 * The conversation has ended, and a person is the right next step.
 *
 * The copy is the same sentence the guard itself uses, on purpose: the guard is what ended
 * the conversation, and repeating its own words here is more honest than paraphrasing them
 * into something warmer than what was said.
 */
function EndedNote({ onContinue }: { readonly onContinue: () => void }) {
  return (
    <div className="mt-12">
      <h2 className="font-display text-subheading text-ink text-pretty">
        A person is the right thing here.
      </h2>
      <p className="text-small text-ink-muted max-w-measure mt-3 text-pretty">
        The questions below will still get you to the same place, and nothing you wrote has been
        lost.
      </p>
      <p className="mt-5">
        <Button onClick={onContinue}>Continue to the questions</Button>
      </p>
    </div>
  );
}

/**
 * What the assistant said that it could not place, and what it had to leave out.
 *
 * Both are shown because both are claims about the limits of what was understood. A silent
 * drop makes the list look complete, and someone who said something the assistant ignored has
 * no way to know that.
 */
function UnplacedNotes({
  notUnderstood,
  surplus,
  vocabulary,
  className,
}: {
  readonly notUnderstood: readonly { category: string; key: string }[];
  readonly surplus: readonly { category: string; key: string }[];
  readonly vocabulary: { languages: readonly { code: string; name: string }[] } | null;
  readonly className?: string;
}) {
  if (notUnderstood.length === 0 && surplus.length === 0) {
    return null;
  }

  const nameOf = (key: string): string => {
    const known = vocabulary?.languages.find((entry) => entry.code === key)?.name;
    return known ?? key.replace(/[-_]/g, ' ');
  };

  return (
    <div className={cx('text-small text-ink-faint', className)}>
      {notUnderstood.length > 0 && (
        <p className="text-pretty">
          I couldn’t place {listOf(notUnderstood.map((entry) => nameOf(entry.key)))}, so I’ve left
          it out rather than guess. It will still be in what you wrote.
        </p>
      )}

      {surplus.length > 0 && (
        <p className="mt-2 text-pretty">
          There {surplus.length === 1 ? 'was' : 'were'} more thing
          {surplus.length === 1 ? '' : 's'} I picked up that {surplus.length === 1 ? 'does' : 'do'}
          n’t fit here. The questions cover the rest.
        </p>
      )}
    </div>
  );
}

/**
 * Time suggestions, offered as a choice and never written in.
 *
 * Someone who said "evenings" has not told us a day, and the availability question is a grid
 * of days and times that a suggestion has no business filling in. So the hint is applied
 * only when pressed, and the question still asks.
 */
function AvailabilityHints({
  suggestions,
  onApply,
}: {
  readonly suggestions: readonly AiSuggestion[];
  readonly onApply: (suggestion: AiSuggestion) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-label text-ink-muted uppercase">Times you mentioned</h3>
      <p className="text-small text-ink-muted max-w-measure mt-2 text-pretty">
        Offered as a starting point. The times question will still ask, and whatever you keep here
        can be changed there.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.key}>
            <QuietButton onClick={() => onApply(suggestion)}>
              {suggestion.target.kind === 'availabilityHint'
                ? `Add ${suggestion.target.label}`
                : suggestion.key}
            </QuietButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the assistant says when the conversation opens.
 *
 * The only thing this product says before a person has typed anything, and it is the line
 * that has to carry the product's whole argument: nobody has to know the vocabulary before
 * they can begin. The mock's own greeting says the same thing, so switching to a real model
 * changes nothing a person would notice on arrival.
 */
const GREETING =
  'You don’t need to know what kind of therapy you need, or any of the words therapists use for it. Tell me in your own words what has been going on.';

/**
 * The guard's replies that end the conversation rather than redirect.
 *
 * Matched on the server's copy rather than on a flag in the response, because the response
 * has no flag and adding one would mean the server deciding what the interface may show. The
 * server's own wording is the contract; if it changes, this stops matching and the interface
 * degrades to "the conversation continues", which is the safe direction.
 */
const GUARD_ENDS = /stop this conversation/i;

/** Where a suggestion would be adjusted. The question that asks for it. */
function questionFor(suggestion: AiSuggestion): string | null {
  switch (suggestion.target.kind) {
    case 'guidance':
      return 'conversation';
    case 'availabilityHint':
      return 'availability';
    case 'draft':
      switch (suggestion.target.field) {
        case 'areasOfWork':
          return 'support';
        case 'communicationStyles':
          return 'conversation';
        case 'contextualExperiences':
          return 'context';
        case 'languages':
          return 'language';
        case 'sessionFormats':
          return 'sessions';
        default:
          return null;
      }
    default:
      return null;
  }
}

/** "a", "a and b", "a, b and c" — the way a person would say it. */
function listOf(items: readonly string[]): string {
  const last = items[items.length - 1];

  if (items.length <= 1) {
    return last ?? '';
  }

  return `${items.slice(0, -1).join(', ')} and ${last ?? ''}`;
}
