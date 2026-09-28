import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { ErrorNote } from '../components/ErrorNote';
import { Eyebrow } from '../components/Eyebrow';
import { Monogram } from '../components/Monogram';
import { ProfileSection } from '../components/ProfileSection';
import { TextLink } from '../components/TextLink';
import { FeedbackLine, PreviousLine, WhatChanged, WhyThisMatch } from '../components/WhatChanged';
import { useApiResource } from '../lib/useApiResource';
import { usePageMeta } from '../lib/usePageMeta';
import { clearReceipt, loadReceipt, saveMatch } from '../lib/intake/session';
import { isRecommendation, requestMatch } from '../lib/api';
import type { MatchRecommendation } from '../lib/api/types';
import { joinNames } from '../lib/format';
import { paths, therapistPath } from '../routes/paths';

/**
 * The recommendation.
 *
 * For a first match this is Phase 5's page with one addition: a way to say "this isn't
 * right", which is the whole point of this phase. For a rematch it is the same page with
 * two extra pieces — a line saying the second search was because of what was said, and a
 * short section on what is demonstrably different about this person.
 *
 * ## What is not here, and why
 *
 * No score, no percentage, no stars, no "best match", no "your number one", no list of
 * anyone else, and no claim to have learnt anything. A page showing three candidates
 * with numbers beside them would be a marketplace with softer typography — the ranking
 * *is* the product, whatever the font. The internal ordering figure decides which single
 * person this is, and then the page stops.
 *
 * "This feels right" and "I'd like another option" are both honest about where they lead:
 * the first is Phase 5's unfinished confirmation, and the second goes to the feedback
 * page, which is built.
 */
export function RecommendationPage() {
  // Read once: a receipt is an identifier and a timestamp, so a refresh returns to the
  // same recommendation rather than to an empty page.
  const [receipt] = useState(loadReceipt);

  const match = useApiResource<MatchRecommendation | null>(
    (signal) => findRecommendation(receipt?.intakeId ?? null, signal),
    [receipt?.intakeId ?? null],
  );

  usePageMeta({
    title:
      match.state.status === 'ready' && match.state.data !== null
        ? match.state.data.therapist.displayName
        : 'Someone you might connect with',
    description: 'One therapist, and the reasons we think you two might work well together.',
  });

  if (receipt === null) {
    return (
      <Frame>
        <NothingToExplain />
      </Frame>
    );
  }

  if (match.state.status === 'loading') {
    return (
      <Frame>
        <Eyebrow>Finding someone</Eyebrow>
        <h1 className="font-display text-title mt-6 text-balance">One moment.</h1>
        {/*
          What the service is doing, plainly. No "AI is thinking", no animated scan, and
          no manufactured delay to feel thorough: this is fifty comparisons and finishes
          in milliseconds, and pretending otherwise would be theatre rather than
          reassurance.
        */}
        <p className="loading-breathe bg-clay-300 mt-10 block h-px w-full" aria-hidden="true" />
        <p aria-live="polite" className="text-small text-ink-muted mt-5 text-pretty">
          Looking through the therapists who may fit what you told us.
        </p>
      </Frame>
    );
  }

  if (match.state.status === 'error') {
    return (
      <Frame>
        <ErrorNote error={match.state.error} onRetry={match.retry} />
        <p className="text-small text-ink-muted mt-6 max-w-md text-pretty">
          What you shared is still saved. Nothing was lost, and trying again will not change it.
        </p>
      </Frame>
    );
  }

  if (match.state.data === null) {
    return (
      <Frame>
        <NobodyQualified />
      </Frame>
    );
  }

  return <Recommendation recommendation={match.state.data} />;
}

function Recommendation({ recommendation }: { readonly recommendation: MatchRecommendation }) {
  const navigate = useNavigate();
  const { therapist, whyThisMatch } = recommendation;

  // Everything the page says about *which* pass this is comes from the response, not
  // from the browser's own record. The server is the only place that knows the attempt
  // number and the person being replaced; reading them from local storage instead would
  // mean a refresh could put "Based on your feedback" on a first match, or quietly lose
  // it on a rematch.
  const isRematch = recommendation.attempt > 1;
  const previous = isRematch ? recommendation.previousTherapistName : null;

  // The match id has to be remembered before the feedback page can act on it, so this
  // runs when a recommendation appears. The record holds only what the next page needs —
  // an id, a name, a pass number — and "start over" clears it.
  useEffect(() => {
    saveMatch({
      matchId: recommendation.matchId,
      therapistName: therapist.displayName,
      attempt: recommendation.attempt,
      previousMatchId: null,
      previousTherapistName: recommendation.previousTherapistName,
    });
  }, [
    recommendation.attempt,
    recommendation.matchId,
    recommendation.previousTherapistName,
    therapist.displayName,
  ]);

  return (
    <Frame>
      {isRematch ? <FeedbackLine /> : <Eyebrow>You shared what matters</Eyebrow>}

      <h1 className="font-display text-title mt-6 text-balance">
        {isRematch
          ? 'We found someone else you might connect with.'
          : 'Here is someone we think you might connect with.'}
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        {isRematch
          ? 'We took your feedback into account, and this is who came out of it.'
          : 'We looked through everyone here against what you told us, and this is the one whose own words about their work overlap the most.'}
      </p>

      <div className="border-line mt-14 border-t pt-8">
        <div className="flex items-start gap-5 sm:gap-7">
          <Monogram name={therapist.displayName} />
          <div className="min-w-0">
            <h2 className="font-display text-title text-balance">{therapist.displayName}</h2>
            <p className="text-label text-clay-700 mt-4 uppercase">{therapist.headline}</p>
          </div>
        </div>

        <p className="text-lead text-ink-muted mt-8 text-pretty">{therapist.bio}</p>

        <p className="text-small text-ink-faint mt-5">
          {therapist.location} · {therapist.yearsOfExperience} years in practice
        </p>

        {previous !== null && <PreviousLine name={previous} />}
      </div>

      <div className="mt-14 flex flex-col gap-14">
        <WhyThisMatch reasons={whyThisMatch} />

        <WhatChanged notes={recommendation.whatChanged} />

        {/*
          Quietly, and this is the point.

          These four were set in the display serif at heading size, one area of work per
          line. On a profile page that reads well, because there the person *is* the
          subject. Here it is not: the subject is the reasoning, three sections above. And
          because the areas came straight after the evidence sentences, three lines of
          display type read as three headings — so the section the whole page exists to
          communicate was visually handing its weight to a list of attributes.

          So the attributes are body text here, and stay in the serif on the profile. One
          rule, applied to two pages: set a thing large when it is the subject of the page,
          and quietly when it is context for something else. It also puts this page in
          agreement with the reviewer's candidate card, which already rendered the same
          fields this way — two surfaces showing one attribute list in two different type
          sizes is how they drift into disagreeing about importance.
        */}
        <ProfileSection label="Works with">
          <p className="text-body text-ink">
            {joinNames(therapist.areasOfWork.map((a) => a.name))}
          </p>
        </ProfileSection>

        <ProfileSection label="How they show up">
          <p className="text-body text-ink">
            {joinNames(therapist.communicationStyles.map((style) => style.name))}
          </p>
        </ProfileSection>

        <ProfileSection label="Languages">
          <p className="text-body text-ink">
            {joinNames(therapist.languages.map((language) => language.name))}
          </p>
        </ProfileSection>

        <ProfileSection label="Sessions">
          <p className="text-body text-ink">
            {joinNames(therapist.sessionFormats.map((format) => format.name))}
          </p>
        </ProfileSection>
      </div>

      <div className="mt-16 flex flex-col items-start gap-6">
        <ButtonLink to={therapistPath(therapist.id)}>
          Read more about {firstNameOnly(therapist.displayName)}
        </ButtonLink>

        {/*
          Present, focusable, and honest. `unavailable` rather than `disabled` so it is
          still announced and still reachable — a control that silently cannot be used
          is worse than one that says why. Recording that a match felt right is genuinely
          the next part of this prototype, and it is not built.
        */}
        <Button unavailable unavailableHint="confirm-hint" variant="quiet">
          This feels right
        </Button>
        <p id="confirm-hint" className="text-small text-ink-faint max-w-sm text-pretty">
          Being able to record that a match felt right is the next part of this prototype, and it
          has not been built yet.
        </p>

        {/*
          The action this phase is about. "I'd like another option" rather than
          "reject", "dislike" or "bad match": a person who has decided this is not for
          them has not assessed the person on the other side of it, and a word that says
          they have is both untrue and a small cruelty.
        */}
        <Button variant="quiet" onClick={() => void navigate(paths.feedback)}>
          I&rsquo;d like another option
        </Button>

        <TextLink to={paths.intake}>Back to your answers</TextLink>
      </div>

      <p className="text-small text-ink-faint mt-14 max-w-md text-pretty">
        Every therapist in this prototype is fictional. The reasons above are read from what each of
        them has said about their own work, and nothing you wrote was interpreted.
      </p>

      <p className="mt-6">
        {/*
          The receipt and the match record are the only things this tab kept after the
          answers were sent, and this is where they go. A prototype with no account
          should leave nothing behind, and "start over" has to mean that.
        */}
        <button
          type="button"
          className="link-quiet text-small text-ink-faint cursor-pointer"
          onClick={() => {
            clearReceipt();
            void navigate(paths.start);
          }}
        >
          Start over
        </button>
      </p>
    </Frame>
  );
}

function NobodyQualified() {
  return (
    <>
      <Eyebrow>No one qualified</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">
        We couldn&rsquo;t find someone who fits all of the things you marked as important.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        That is an answer rather than a failure. It means the conditions you set — the things you
        marked as must-haves rather than preferences — are not ones any one person here meets yet.
      </p>

      {/*
        The honest next step, and the one this phase cannot take. Loosening a requirement
        and looking again is real work on the matching side, so the control is present,
        focusable, and says so.
      */}
      <div className="mt-10 flex flex-col items-start gap-6">
        <Button unavailable unavailableHint="revisit-hint" variant="quiet">
          Loosen one thing and look again
        </Button>
        <p id="revisit-hint" className="text-small text-ink-faint max-w-sm text-pretty">
          Adjusting your requirements and searching again is the next part of this prototype, and it
          has not been built yet.
        </p>
        <TextLink to={paths.intake}>Back to your answers</TextLink>
      </div>
    </>
  );
}

function NothingToExplain() {
  return (
    <>
      <Eyebrow>Nothing to look up</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">
        There&rsquo;s nothing here to explain yet.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        A recommendation appears once you have shared what matters. It is a few short questions, one
        at a time, and you can leave any of it blank.
      </p>

      <div className="mt-10 flex flex-col items-start gap-5">
        <ButtonLink to={paths.intake}>Start the questions</ButtonLink>
        <TextLink to={paths.home}>Back to the beginning</TextLink>
      </div>
    </>
  );
}

function firstNameOnly(name: string): string {
  return name.split(' ')[0] ?? name;
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">{children}</div>
    </Container>
  );
}

async function findRecommendation(
  intakeId: string | null,
  signal: AbortSignal,
): Promise<MatchRecommendation | null> {
  if (intakeId === null) {
    return null;
  }

  const outcome = await requestMatch(intakeId, undefined, { signal });

  return isRecommendation(outcome) ? outcome : null;
}
