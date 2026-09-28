import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Container } from '../../components/Container';
import { Eyebrow } from '../../components/Eyebrow';
import { LoadingNote } from '../../components/LoadingNote';
import { QuietButton } from '../../components/QuietButton';
import { TextLink } from '../../components/TextLink';
import { ConversationLog, useScrollToNewest } from '../../components/intake/ConversationLog';
import { Composer } from '../../components/intake/Composer';
import { SuggestionList, type SuggestionVerdict } from '../../components/intake/SuggestionList';
import { requestAiExtraction, requestAiTurn, type AiMessage, type AiSuggestion } from '../../lib/api/ai';
import { isApiError, toApiError, type ApiError } from '../../lib/api/errors';
import { useIntake } from '../../lib/intake/intakeContext';
import { applyAvailabilityHint, applySuggestion } from '../../lib/intake/suggestions';
import {
  appendMessage,
  clearConversation,
  loadConversation,
  saveConversation,
} from '../../lib/intake/conversation';
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

  const [messages, setMessages] = useState<readonly AiMessage[]>(() => loadConversation());
  const [pending, setPending] = useState(false);
  const [turnError, setTurnError] = useState<ApiError | null>(null);
  const [extractError, setExtractError] = useState<ApiError | null>(null);
  const [suggestions, setSuggestions] = useState<readonly AiSuggestion[] | null>(null);
  const [notUnderstood, setNotUnderstood] = useState<readonly { category: string; key: string }[]>([]);
  const [surplus, setSurplus] = useState<readonly { category: string; key: string }[]>([]);
  const [verdicts, setVerdicts] = useState<Readonly<Record<string, SuggestionVerdict>>>({});
  const [unavailable, setUnavailable] = useState(false);
  // How much of the transcript a screen reader has been told. One from the start, because
  // the greeting is on the page when the route opens and is read in the visual order.
  const [announcedUpTo, setAnnouncedUpTo] = useState(1);

  const endOfLog = useScrollToNewest(messages.length);
  const inFlight = useRef<AbortController | null>(null);

  const remember = useCallback((next: readonly AiMessage[]) => {
    setMessages(next);
    saveConversation(next);
  }, []);

  /**
   * The greeting.
   *
   * Rendered locally rather than requested, for two reasons. A person should not wait on a
   * network round trip to read "tell me in your own words" — and the page must work at all
   * when there is no assistant. It is therefore plain text this file owns, which also means
   * a reviewer can see exactly what the product says on arrival without running anything.
   */
  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    const greeting: AiMessage = {
      role: 'assistant',
      text:
        'You don’t need to know what kind of therapy you need, or any of the words therapists use for it. Tell me in your own words what has been going on.',
    };

    remember([greeting]);
  }, [messages.length, remember]);

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
          if (controller.signal.aborted || isApiError(reason) && reason.kind === 'aborted') {
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
        if (controller.signal.aborted || isApiError(reason) && reason.kind === 'aborted') {
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
      setVerdicts((current) => ({ ...current, [`${suggestion.category}:${suggestion.key}`]: 'kept' }));

      if (result.ok && result.draft !== draft) {
        update(() => result.draft);
      }
    },
    [draft, update],
  );

  const reject = useCallback((suggestion: AiSuggestion) => {
    setVerdicts((current) => ({ ...current, [`${suggestion.category}:${suggestion.key}`]: 'rejected' }));
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
      navigate(question === null ? intakePath('support') : intakePath(question));
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
  const hintSuggestions = suggestions?.filter((entry) => entry.target.kind === 'availabilityHint') ?? [];

  return (
    <section className="wash-quiet">
      <Container className="pt-10 pb-16 sm:pt-14">
        <div className="max-w-2xl">
          <Eyebrow>Optional · before the questions</Eyebrow>

          <h1 className="font-display text-title mt-6 text-balance">
            Tell us in your own words.
          </h1>

          <p className="text-lead text-ink-muted mt-5 max-w-measure text-pretty">
            Write what has been going on, and we’ll show you what we understood before anything
            is saved. You can keep what’s right, change what isn’t, or skip all of it and answer
            the questions instead.
          </p>
        </div>

        {/*
          The log and the composer share a narrower measure than the page heading. Prose is
          comfortable at about sixty-five characters, and a conversation is prose.
        */}
        <div className="mt-10 max-w-2xl sm:mt-12">
          <ConversationLog messages={messages} announcedUpTo={announcedUpTo} />

          {pending && (
            <p className="border-line border-t py-6">
              <LoadingNote>Making sense of that.</LoadingNote>
            </p>
          )}

          {turnError !== null && (
            <TurnError error={turnError} onRetry={() => setTurnError(null)} />
          )}

          {!unavailable && (
            <div className="border-line border-t py-7">
              <Composer
                onSend={send}
                disabled={pending}
                unavailableReason={turnError === null ? null : 'Your message is still here. Try sending it again.'}
              />
            </div>
          )}

          {unavailable && <EndedNote onContinue={() => navigate(intakePath('support'))} />}

          {/*
            The offer to summarise is a button, not an automatic step. Auto-summarising after
            two messages would be the interface deciding the person has said enough, and
            somebody who has just found the right words would have them interrupted.
          */}
          {!unavailable && messages.some((message) => message.role === 'user') && (
            <div className="border-line border-t py-6">
              <p className="text-small text-ink-muted max-w-measure text-pretty">
                {suggestions === null
                  ? 'When you feel you have said enough, we can read it back as answers to the questions.'
                  : suggestions.length === 0
                    ? 'There was nothing in that I could place against the questions. The questions themselves may serve you better.'
                    : 'Does that sound right?'}
              </p>

              {suggestions === null ? (
                <p className="mt-3">
                  <QuietButton onClick={askForSuggestions} disabled={pending}>
                    Show me what you understood
                  </QuietButton>
                </p>
              ) : (
                <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  <QuietButton onClick={askForSuggestions} disabled={pending}>
                    Read it again
                  </QuietButton>
                  <TextLink to={intakePath('support')}>Answer the questions myself</TextLink>
                </p>
              )}

              {extractError !== null && (
                <p className="mt-4 text-small text-clay-700" role="alert">
                  Something went wrong while reading that back. What you wrote is still here.{' '}
                  <QuietButton onClick={askForSuggestions}>Try again</QuietButton>
                </p>
              )}
            </div>
          )}

          {suggestions !== null && (
            <div className="mt-8">
              <h2 className="font-display text-subheading text-ink">
                {suggestions.length === 0 ? 'What I could place' : 'Here’s what I heard'}
              </h2>

              <p className="text-small text-ink-muted mt-2 max-w-measure text-pretty">
                Nothing has been saved yet. Keep what is right, or answer the questions yourself —
                either way, you decide.
              </p>

              {suggestions.length > 0 && (
                <SuggestionList
                  className="mt-6"
                  suggestions={suggestions}
                  verdicts={verdicts}
                  onKeep={keep}
                  onReject={reject}
                  onChange={change}
                  draft={draft}
                />
              )}

              {/*
                Rendered whatever the list holds. A person who said something the assistant
                could not place, and got no suggestions back, needs to be told *that* — it is
                the most useful sentence on the page for them, and burying it inside a block
                that only appears with results would lose exactly the people who need it.
              */}
              <UnplacedNotes
                className="mt-6"
                notUnderstood={notUnderstood}
                surplus={surplus}
                vocabulary={vocabulary}
              />

              {hintSuggestions.length > 0 && (
                <AvailabilityHints suggestions={hintSuggestions} onApply={applyHint} />
              )}

              <div className="mt-8 flex flex-col items-start gap-4">
                <ButtonLink to={intakePath('support')}>
                  {keptCount > 0
                    ? 'Continue with these'
                    : 'Answer the questions yourself'}
                </ButtonLink>
                <QuietButton onClick={startOver}>Clear this conversation</QuietButton>
              </div>
            </div>
          )}

          <div ref={endOfLog} aria-hidden="true" className="h-px" />

          {/*
            The way out is always here, and it is the primary action whenever the assistant
            has produced nothing usable. A companion that trapped somebody in a conversation
            would be a worse intake than the one it replaced.
          */}
          <div className="border-line mt-10 border-t pt-7">
            <h2 className="text-label text-ink-muted uppercase">Or go straight to the questions</h2>
            <p className="text-small text-ink-muted mt-2 max-w-measure text-pretty">
              Seven short questions, one at a time. Anything the assistant suggested is already
              filled in — you can change any of it.
            </p>
            <p className="mt-4">
              <ButtonLink to={intakePath('support')} variant="quiet">
                The questions
              </ButtonLink>
            </p>
            <p className="mt-4">
              <TextLink to={paths.start}>Back to the start</TextLink>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** The failure state, in the product's voice rather than the browser's. */
function TurnError({ error, onRetry }: { readonly error: ApiError; readonly onRetry: () => void }) {
  const unavailable = error.status === 503;

  return (
    <div className="border-line border-t py-6" role="alert">
      <p className="text-body text-ink text-pretty">
        {unavailable
          ? 'The conversation assistant is switched off.'
          : 'Something went wrong while interpreting that.'}
      </p>
      <p className="text-small text-ink-muted mt-2 text-pretty">
        {unavailable
          ? 'That’s okay. You can continue without it — the questions are below.'
          : 'Your answers are still here.'}
      </p>

      {!unavailable && (
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <QuietButton onClick={onRetry}>Try again</QuietButton>
          <TextLink to={intakePath('support')}>The questions</TextLink>
        </p>
      )}
    </div>
  );
}

/** The assistant has ended the conversation. The questions are the way on. */
function EndedNote({ onContinue }: { readonly onContinue: () => void }) {
  return (
    <div className="border-line border-t py-7">
      <h2 className="text-label text-ink-muted uppercase">Where you can go from here</h2>
      <p className="text-body text-ink mt-3 max-w-measure text-pretty">
        A person is the right thing here, not an assistant. The questions below will still get
        you to the same place.
      </p>
      <p className="mt-4">
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
          I couldn’t place {listOf(notUnderstood.map((entry) => nameOf(entry.key)))}, so I’ve
          left it out rather than guess. It will still be in what you wrote.
        </p>
      )}

      {surplus.length > 0 && (
        <p className="mt-2 text-pretty">
          There {surplus.length === 1 ? 'was' : 'were'} more thing
          {surplus.length === 1 ? '' : 's'} I picked up that {surplus.length === 1 ? 'does' : 'do'}n’t
          fit here. The questions cover the rest.
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
      <p className="text-small text-ink-muted mt-2 max-w-measure text-pretty">
        Offered as a starting point. The times question will still ask, and whatever you keep
        here can be changed there.
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
