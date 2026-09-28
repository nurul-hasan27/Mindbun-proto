import { useCallback, useState } from 'react';
import { cx } from '../lib/cx';
import { useParams } from 'react-router';
import { Button } from '../components/Button';
import { QuietButton } from '../components/QuietButton';
import { Container } from '../components/Container';
import { ErrorNote } from '../components/ErrorNote';
import { LoadingNote } from '../components/LoadingNote';
import { TextLink } from '../components/TextLink';
import { CandidateCard } from '../components/workspace/CandidateCard';
import { DecisionProblem, DecisionReasons } from '../components/workspace/DecisionReasons';
import { JourneyTimeline } from '../components/workspace/JourneyTimeline';
import { WorkspaceColumns, WorkspaceEyebrow } from '../components/workspace/WorkspaceColumns';
import { fetchCase, submitDecision, type CaseDetail, type ClientsWords } from '../lib/api';
import { isApiError } from '../lib/api/errors';
import { useApiResource } from '../lib/useApiResource';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

/**
 * One case, in full.
 *
 * ## The order of this page is the order of the questions
 *
 * A matcher arrives with questions, and the sections are laid out in the order they get
 * asked:
 *
 * 1. **What does this client need?** — before anything else, because every judgement below
 *    is a judgement about fit, and fit has no meaning without the request.
 * 2. **What did the system suggest, and why?** — labelled *System suggestion* rather than
 *    "recommendation", because the whole point is that it is a suggestion. A heading that
 *    called it a match would settle the question the page exists to reopen.
 * 3. **What else is there?** — the alternatives, each with their evidence and their gaps.
 * 4. **What did the matcher decide?** — two calm paths and nothing else.
 * 5. **What happened before?** — the journey, last, because a matcher reads it once the
 *    decision is made and not before.
 *
 * ## Two things this page will not do
 *
 * It will not show a score, a rank, a percentage or a weight. The engine's internal figure
 * decides an order and then disappears; a reviewer's case for disagreeing is *evidence*, and
 * a number is not evidence — it is an oracle they would learn to defer to, which is the
 * failure this whole surface exists to prevent.
 *
 * And it will not call keeping the system suggestion an approval, or choosing somebody else
 * an override. The vocabulary is "use this recommendation" and "choose another therapist",
 * because the alternative framing makes disagreement sound like a mistake to be explained.
 */
export function MatchingWorkspaceCasePage() {
  const { matchId } = useParams<{ matchId: string }>();
  usePageMeta({ title: 'Reviewing a case' });

  const { state, retry } = useApiResource<CaseDetail>(
    (signal) => fetchCase(matchId ?? '', { signal }),
    [matchId],
  );

  if (state.status === 'loading') {
    return (
      <Container as="section" className="pt-section pb-section">
        <LoadingNote>Opening the case.</LoadingNote>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container as="section" className="pt-section pb-section">
        <TextLink to={paths.matchingWorkspace}>Back to the queue</TextLink>
        <div className="mt-10">
          <ErrorNote error={state.error} onRetry={retry} />
        </div>
      </Container>
    );
  }

  return <CaseView detail={state.data} onDecided={retry} />;
}

function CaseView({
  detail,
  onDecided,
}: {
  readonly detail: CaseDetail;
  readonly onDecided: () => void;
}) {
  const { suggestion, decision, selectableMatchIds } = detail;

  /**
   * The two paths, and the one question in between.
   *
   * `null` means the matcher has not chosen yet. A *string* means they have chosen a
   * candidate, which is the only thing that makes a reason required — accepting the system
   * suggestion overrides nothing, so it justifies nothing.
   */
  const [chosen, setChosen] = useState<string | null>(null);
  const [reasons, setReasons] = useState<readonly string[]>([]);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectable = new Set(selectableMatchIds);
  const isSuggestionChosen = chosen === suggestion.matchId;

  const submit = useCallback(async () => {
    if (chosen === null || saving) {
      return;
    }

    setSaving(true);
    setProblem(null);

    try {
      await submitDecision(detail.summary.matchId, {
        selectedMatchId: chosen,
        reasons: [...reasons],
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });

      onDecided();
    } catch (error) {
      // The server's sentences are the ones worth showing. They are written for the person
      // making the decision — "this therapist did not meet something the client marked as
      // important" says what to do next, where a status code says nothing at all.
      setProblem(
        isApiError(error) && error.kind === 'http' && error.status === 422
          ? 'That choice was refused. Pick a therapist from the ones above and say why.'
          : 'We could not record that just now. Nothing was saved, so you can try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [chosen, detail.summary.matchId, note, onDecided, reasons, saving]);

  return (
    <Container as="section" className="pt-section pb-section">
      <TextLink to={paths.matchingWorkspace}>Back to the queue</TextLink>

      <header className="max-w-measure mt-8">
        <p className="text-label text-ink-muted font-medium uppercase">
          Case ·{' '}
          {detail.summary.attempt === 1 ? 'First search' : `Search ${detail.summary.attempt}`}
        </p>
        <h1 className="text-title font-display mt-4">Reviewing this case</h1>
        <p className="text-lead text-ink-muted mt-5">
          {decision !== null
            ? 'This case has been decided. The record is below, and nothing here can be changed — a decision is a record of a moment, not a setting.'
            : 'What this client asked for, what the system found, and what else there is. The last word is yours.'}
        </p>
      </header>

      <div className="mt-16 flex flex-col gap-16">
        <ClientNeedsSection detail={detail} />
        <SuggestionSection detail={detail} />
        <AlternativesSection detail={detail} />
        <DecisionSection
          detail={detail}
          chosen={chosen}
          setChosen={setChosen}
          reasons={reasons}
          setReasons={setReasons}
          note={note}
          setNote={setNote}
          problem={problem}
          saving={saving}
          isSuggestionChosen={isSuggestionChosen}
          selectable={selectable}
          onSubmit={() => void submit()}
        />
        <JourneySection detail={detail} />
      </div>
    </Container>
  );
}

// ---------------------------------------------------------------------------
// 1. What this client needs
// ---------------------------------------------------------------------------

/**
 * The client's own answers, organised by what was asked for.
 *
 * ## Why the intake's free text is not here
 *
 * Two reasons, and the second is the one that matters. The first is relevance: a matcher's
 * judgement is about fit, and fit is about the structured answers. The second is that this
 * text is a person explaining their life to a stranger, and the stranger here does not need
 * it to compare two therapists.
 *
 * It is available, on request, at the bottom of this section — which is where a matcher who
 * genuinely needs it will look, and it costs one deliberate click to reach.
 */
function ClientNeedsSection({ detail }: { readonly detail: CaseDetail }) {
  const { needs } = detail;

  const families: { label: string; entries: readonly { name: string }[] }[] = [
    { label: 'Support with', entries: needs.areasOfWork },
    { label: 'Language', entries: needs.languages },
    {
      label: 'Conversation style',
      // Suppressed rather than shown empty when the client said they were not sure. Nobody
      // asked, so there is nothing for a candidate to be missing.
      entries: needs.openToGuidance ? [] : needs.communicationStyles,
    },
    { label: 'Context', entries: needs.contextualExperiences },
    { label: 'Approach', entries: needs.approaches },
    { label: 'Session format', entries: needs.sessionFormats },
  ];

  return (
    <Section title="What this client needs" id="needs">
      <div className="flex flex-col gap-7">
        {families.map((family) => (
          <WorkspaceColumns key={family.label} label={family.label}>
            {family.entries.length === 0 ? (
              <p className="text-small text-ink-faint">
                {family.label === 'Conversation style' && needs.openToGuidance
                  ? 'Not sure yet — they said they would rather be guided.'
                  : 'They were not asked.'}
              </p>
            ) : (
              /*
               * A list rather than a middot-joined line, because the terms are separate
               * things the client chose and a separator between them reads as part of a
               * phrase. `shrink-0` so a two-word term cannot be squeezed into wrapping
               * mid-name when there is room beside it.
               */
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {family.entries.map((entry) => (
                  <li key={entry.name} className="text-body text-ink shrink-0">
                    {entry.name}
                  </li>
                ))}
              </ul>
            )}
          </WorkspaceColumns>
        ))}

        {needs.availability !== null && (
          <WorkspaceColumns label="Availability">
            <p className="text-body text-ink">
              {needs.availability.windows
                .map(
                  (window) =>
                    `${window.dayOfWeek.toLowerCase()} ${formatClock(window.startMinute)}–${formatClock(window.endMinute)}`,
                )
                .join(', ')}
            </p>
            <p className="text-micro text-ink-faint mt-2">
              In {needs.availability.timezone}, their own local time.
            </p>
          </WorkspaceColumns>
        )}

        {needs.markedAsRequirements && (
          <p className="text-small text-ink-muted max-w-measure">
            This client marked some of these as things they need rather than would like. A therapist
            who does not meet one of those cannot be put in front of them — not even by someone
            reviewing this case.
          </p>
        )}
      </div>

      <ClientsWords matchId={detail.summary.matchId} />
    </Section>
  );
}

/**
 * The client's free text, behind a deliberate act.
 *
 * Three states, and they are genuinely different: not asked for, asked for and there is
 * nothing, asked for and there is something. The button is the only thing in this codebase
 * that requests it, so the second request is visible in a network log and the case payload
 * above is provably free of it.
 */
function ClientsWords({ matchId }: { readonly matchId: string }) {
  const [revealed, setRevealed] = useState<ClientsWords | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (revealed !== null) {
    const hasAnything = revealed.intakeNote !== null || revealed.feedbackNotes.length > 0;

    return (
      <div className="border-line bg-surface-quiet rounded-panel mt-8 border p-6">
        <WorkspaceEyebrow>Their own words</WorkspaceEyebrow>

        {!hasAnything ? (
          <p className="text-small text-ink-muted mt-3">
            They did not write anything in their own words.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {revealed.intakeNote !== null && (
              <p className="text-small text-ink-muted text-pretty">“{revealed.intakeNote}”</p>
            )}
            {revealed.feedbackNotes.map((entry) => (
              <p key={entry.attempt} className="text-small text-ink-muted text-pretty">
                <span className="text-ink">After search {entry.attempt}, they wrote:</span> “
                {entry.note}”
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8">
      {failed ? (
        <p role="alert" className="text-small text-ink-muted">
          We could not load that just now.
        </p>
      ) : (
        <>
          <p className="text-small text-ink-muted max-w-measure">
            They wrote something in their own words at the end of the questions. It is not needed to
            compare therapists, so it is not loaded unless you ask.
          </p>
          <p className="mt-4">
            <QuietButton
              onClick={() => {
                setBusy(true);
                setFailed(false);

                void fetchCase(matchId, { reveal: true })
                  .then((record) => setRevealed(record.clientsWords))
                  .catch(() => setFailed(true))
                  .finally(() => setBusy(false));
              }}
              // A real `disabled` rather than `aria-disabled`, because this is a *fetch*
              // guard and not a form-validity hint: a second click would issue a second
              // request for the same text. The label says what is happening.
              disabled={busy}
            >
              {busy ? 'Loading…' : 'Show their own words'}
            </QuietButton>
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. What the system suggested
// ---------------------------------------------------------------------------

/**
 * The engine's recommendation, and the case for it.
 *
 * The heading says "System suggestion" and the section says "Why the system suggested
 * them". Both are deliberate. A matcher who reads "Recommendation" has already been told
 * the answer, and everything below is then a formality.
 */
function SuggestionSection({ detail }: { readonly detail: CaseDetail }) {
  const { suggestion } = detail;

  return (
    <Section title="What the system suggested" id="suggestion" label="System suggestion">
      <CandidateCard
        therapist={suggestion.therapist}
        shared={suggestion.shared}
        notOffered={suggestion.notOffered}
        explainVoice
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3. What else there is
// ---------------------------------------------------------------------------

/**
 * The alternatives.
 *
 * A small, fixed set. The engine evaluated every therapist in the pool; showing fifty would
 * be a dump of its shortlist, and a matcher scrolling a list of fifty is reading none of
 * it. Four is enough to see a real choice, which is the whole reason for a person being in
 * this loop.
 */
function AlternativesSection({ detail }: { readonly detail: CaseDetail }) {
  const { alternatives } = detail;
  const setAside = alternatives.filter((entry) => !entry.eligible).length;

  return (
    <Section
      title="Other candidates"
      id="alternatives"
      label={`${alternatives.length} other${alternatives.length === 1 ? '' : 's'}`}
    >
      {alternatives.length === 0 ? (
        <p className="text-small text-ink-muted">
          Nobody else in the pool met everything this client marked as important, so there is
          nothing to choose between. The suggestion above is the only person who can be offered.
        </p>
      ) : (
        <>
          <p className="text-small text-ink-muted max-w-measure mb-8">
            These are the others the engine considered, in its own order of preference. No scores —
            the evidence is below each one, and the gaps are as useful as the matches.
          </p>

          <div className="flex flex-col gap-10">
            {alternatives.map((candidate) => (
              <CandidateCard
                key={candidate.matchId}
                therapist={candidate.therapist}
                shared={candidate.shared}
                notOffered={candidate.notOffered}
                rejectionCode={candidate.rejectionCode}
              />
            ))}
          </div>

          {setAside > 0 && (
            <p className="text-small text-ink-muted max-w-measure mt-10">
              The engine set aside others who did not meet everything this client marked as
              important. They are listed above so you can see why, and they cannot be chosen.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 4. What the matcher decided
// ---------------------------------------------------------------------------

interface DecisionSectionProps {
  readonly detail: CaseDetail;
  readonly chosen: string | null;
  readonly setChosen: (id: string) => void;
  readonly reasons: readonly string[];
  readonly setReasons: (reasons: readonly string[]) => void;
  readonly note: string;
  readonly setNote: (note: string) => void;
  readonly problem: string | null;
  readonly saving: boolean;
  readonly isSuggestionChosen: boolean;
  readonly selectable: ReadonlySet<string>;
  readonly onSubmit: () => void;
}

/**
 * The decision, and only the decision.
 *
 * Once decided, this section becomes a record rather than a form, and there is no "change
 * my mind" control. That is a real limit and a deliberate one: a decision is a record of a
 * moment, and editing it would rewrite the trail it exists to provide. If a decision turns
 * out to be wrong, the honest correction is a new case — which is what a client asking to
 * look again produces.
 */
function DecisionSection({
  detail,
  chosen,
  setChosen,
  reasons,
  setReasons,
  note,
  setNote,
  problem,
  saving,
  isSuggestionChosen,
  selectable,
  onSubmit,
}: DecisionSectionProps) {
  const { decision, suggestion, alternatives, decisionReasons } = detail;

  if (decision !== null) {
    const keptSuggestion = decision.decisionType === 'SYSTEM_ACCEPTED';

    return (
      <Section title="The decision" id="decision">
        <p className="text-lead text-ink font-display">
          {keptSuggestion
            ? `You agreed with ${suggestion.therapist.displayName}.`
            : `You chose ${nameOfSelected(detail)}.`}
        </p>
        <p className="text-small text-ink-muted max-w-measure mt-4">
          {keptSuggestion ? (
            <>
              That is who the client will be shown. The client is told someone may be a good fit,
              and nothing about who chose them or how.
            </>
          ) : (
            <>
              The system had suggested {suggestion.therapist.displayName}. That recommendation has
              not been changed — it is still on the record, with its own evidence — but the client
              will be shown {nameOfSelected(detail)} instead.
            </>
          )}
        </p>
        {decision.reasonKeys.length > 0 && (
          <p className="text-small text-ink-muted mt-4">
            Reasons given: {decision.reasonKeys.map(readable).join(', ')}.
          </p>
        )}
        {decision.note !== null && (
          <p className="text-small text-ink-muted mt-2 italic">“{decision.note}”</p>
        )}
        <p className="text-small text-ink-faint mt-6">
          A decision is a record of a moment, so it cannot be changed here. If it turns out to be
          wrong, the honest correction is a new case.
        </p>
      </Section>
    );
  }

  const reasonsRequired = chosen !== null && !isSuggestionChosen;
  const canSubmit = chosen !== null && (!reasonsRequired || reasons.length > 0) && !saving;
  const problemId = 'decision-reasons-hint';

  return (
    <Section title="The decision" id="decision">
      <fieldset>
        <legend className="text-label text-ink-muted font-medium uppercase">
          Who should the client be shown
        </legend>
        <p className="text-small text-ink-muted max-w-measure mt-3">
          Two paths, and neither is the correct one. Agreeing is a real answer, and so is choosing
          somebody else.
        </p>

        <ul className="mt-6 flex flex-col gap-3">
          <Choice
            name="decision"
            selected={chosen === suggestion.matchId}
            onSelect={() => setChosen(suggestion.matchId)}
            title="Use this recommendation"
            detail={`${suggestion.therapist.displayName} — the person the system suggested`}
          />
          {alternatives
            .filter((candidate) => selectable.has(candidate.matchId))
            .map((candidate) => (
              <Choice
                key={candidate.matchId}
                name="decision"
                selected={chosen === candidate.matchId}
                onSelect={() => setChosen(candidate.matchId)}
                title={candidate.therapist.displayName}
                detail={candidate.therapist.headline}
              />
            ))}
        </ul>
      </fieldset>

      {chosen !== null && (
        <div className="mt-10 flex flex-col gap-8">
          <DecisionReasons
            reasons={decisionReasons}
            selected={reasons}
            describedBy={problemId}
            required={reasonsRequired}
            onToggle={(key) =>
              setReasons(
                reasons.includes(key)
                  ? reasons.filter((entry) => entry !== key)
                  : [...reasons, key],
              )
            }
          />

          <div>
            <label
              htmlFor="decision-note"
              className="text-label text-ink-muted block font-medium uppercase"
            >
              Anything else (optional)
            </label>
            <p className="text-small text-ink-muted mt-3 mb-4">
              In your own words. Stored with the decision, shown to nobody but you, and never sent
              to the client.
            </p>
            <textarea
              id="decision-note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="focus-within-ring border-line-strong text-body rounded-control bg-surface w-full border px-4 py-3"
            />
          </div>

          {problem !== null && <DecisionProblem>{problem}</DecisionProblem>}

          <div className="flex flex-col flex-wrap items-start gap-x-6 gap-y-3">
            <Button onClick={onSubmit} unavailable={!canSubmit} unavailableHint="decision-blocked">
              {saving ? 'Recording…' : 'Record this decision'}
            </Button>

            {/*
              Both hints are on the page, not just announced. A control that cannot be used
              should say why to whoever is looking at it, which is most of them — a screen
              reader user is the exception, not the rule.
            */}
            {chosen === null ? (
              <p id="decision-blocked" className="text-small text-ink-faint">
                Choose a therapist above first.
              </p>
            ) : reasonsRequired && reasons.length === 0 ? (
              <p id="decision-blocked" className="text-small text-ink-faint">
                Say what made this a better fit — at least one reason — before recording it.
              </p>
            ) : (
              <p className="text-small text-ink-faint">
                The system’s own recommendation stays on the record either way.
              </p>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

/** One radio in the decision, drawn rather than left to the browser. */
function Choice({
  name,
  selected,
  onSelect,
  title,
  detail,
}: {
  readonly name: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <li>
      <label
        className={
          'focus-within-ring border-line-strong hover:border-clay-300 rounded-control ease-gentle flex cursor-pointer items-start gap-3 border p-4 transition-colors duration-200' +
          (selected ? ' border-clay-400 bg-clay-50' : '')
        }
      >
        <input
          type="radio"
          name={name}
          checked={selected}
          onChange={onSelect}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ' +
            (selected ? 'border-clay-700' : 'border-line-strong bg-surface')
          }
        >
          {selected && <span className="bg-clay-700 block h-2.5 w-2.5 rounded-full" />}
        </span>
        <span className="min-w-0">
          <span className="text-body text-ink block">{title}</span>
          <span className="text-small text-ink-muted mt-0.5 block">{detail}</span>
        </span>
      </label>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 5. What happened before
// ---------------------------------------------------------------------------

/**
 * The journey, and the free text.
 *
 * A matcher reading a third pass needs to know what the client has already said no to and
 * why, or they will select somebody the client has just declined — and find out from the
 * client rather than from this page.
 */
function JourneySection({ detail }: { readonly detail: CaseDetail }) {
  const feedbackNames: Record<string, string> = {};

  return (
    <Section title="How this got here" id="journey">
      <p className="text-small text-ink-muted max-w-measure mb-8">
        Every search on this journey, what the client said about each one, and what was decided. The
        evidence for each of those suggestions is on the case above.
      </p>

      <JourneyTimeline
        steps={detail.journey}
        feedbackNames={feedbackNames}
        currentMatchId={detail.summary.matchId}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/**
 * One section of the case.
 *
 * `label` is the short form shown in the small caps in the margin — "System suggestion"
 * reads better there than "What the system suggested". It is decoration: the region is
 * labelled by the heading, because a region called "3 others" is not a name anybody can
 * navigate by, and an `h2` in the margin that duplicates the heading is a level of nesting
 * the document does not have.
 */
function Section({
  title,
  id,
  label,
  children,
}: {
  readonly title: string;
  readonly id: string;
  readonly label?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="border-line border-t pt-10">
      <div className="md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
        {label !== undefined && <WorkspaceEyebrow className="md:pt-2">{label}</WorkspaceEyebrow>}
        {/*
          With no margin label there is one grid child, and a lone child lands in the
          *first* column — so the heading sat in the 10rem label column and wrapped to
          three words. `col-start-2` is the fix, and it is a fix rather than a
          `col-span-2` because the content should still start where the other sections'
          content does, so the whole page has one left edge below the headings.
        */}
        <div className={cx('mt-4 md:mt-0', label === undefined && 'md:col-start-2')}>
          <h2 id={`${id}-heading`} className="text-heading font-display">
            {title}
          </h2>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </section>
  );
}

function nameOfSelected(detail: CaseDetail): string {
  if (detail.decision === null) {
    return 'somebody else';
  }

  const chosen =
    detail.alternatives.find((entry) => entry.matchId === detail.decision?.selectedMatchId) ??
    detail.suggestion;

  return chosen.therapist.displayName;
}

function readable(key: string): string {
  return key.replaceAll('-', ' ');
}

function formatClock(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
