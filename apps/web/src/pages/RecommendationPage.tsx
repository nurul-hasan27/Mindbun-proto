import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { ErrorNote } from '../components/ErrorNote';
import { Eyebrow } from '../components/Eyebrow';
import { Monogram } from '../components/Monogram';
import { ProfileSection } from '../components/ProfileSection';
import { TextLink } from '../components/TextLink';
import { WhyThisMatch } from '../components/WhyThisMatch';
import { useApiResource } from '../lib/useApiResource';
import { usePageMeta } from '../lib/usePageMeta';
import { clearReceipt, loadReceipt } from '../lib/intake/session';
import { isRecommendation, requestMatch, type MatchRecommendation } from '../lib/api';
import { joinNames } from '../lib/format';
import { paths, therapistPath } from '../routes/paths';

/**
 * The recommendation.
 *
 * This page is the argument the whole prototype has been making, so it has one job:
 * introduce one person, and say plainly why that person rather than anyone else.
 *
 * ## What is not here, and why
 *
 * No score, no percentage, no stars, no "best match", no "your number one", no list
 * of anyone else, and no way yet to ask for a different person. A page showing three
 * candidates with numbers beside them would be a marketplace with softer typography —
 * the ranking *is* the product, whatever the font. The brief asked for one person
 * and the reasons, and the only honest way to honour that is to show one person.
 *
 * "This feels right" is present, focusable, and says it is not available yet.
 * Rematching is the next phase; a control that quietly did nothing would be a small
 * lie in the exact place the product is asking for trust.
 *
 * ## Shape
 *
 * A continuation of the intake rather than a result screen. The reasons come before
 * the biography, because someone who has just answered seven questions wants to
 * know *why*, not who.
 */
export function RecommendationPage() {
  // Read once: a receipt is an identifier and a timestamp, so a refresh returns to
  // the same recommendation rather than to an empty page.
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
          What the service is doing, plainly. No "AI is thinking", no animated
          scan, and no manufactured delay to feel thorough: this is fifty
          comparisons and finishes in milliseconds, and pretending otherwise would
          be theatre rather than reassurance.
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

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">{children}</div>
    </Container>
  );
}

function Recommendation({ recommendation }: { readonly recommendation: MatchRecommendation }) {
  const navigate = useNavigate();
  const { therapist, whyThisMatch } = recommendation;

  return (
    <Frame>
      {/*
        The transition from the intake, in one line. The person has just answered
        seven questions about what matters to them; the first thing this page says
        is that those answers are what produced the person below.
      */}
      <Eyebrow>You shared what matters</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">
        Here is someone we think you might connect with.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        We looked through everyone here against what you told us, and this is the one whose own
        words about their work overlap the most.
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
      </div>

      <div className="mt-14 flex flex-col gap-14">
        <WhyThisMatch reasons={whyThisMatch} />

        <ProfileSection label="Works with">
          <ul className="flex flex-col gap-3">
            {therapist.areasOfWork.map((area) => (
              <li key={area.key} className="font-display text-heading text-ink">
                {area.name}
              </li>
            ))}
          </ul>
        </ProfileSection>

        <ProfileSection label="How they show up">
          <p className="font-display text-subheading text-ink text-balance">
            {joinNames(therapist.communicationStyles.map((style) => style.name))}
          </p>
        </ProfileSection>

        <ProfileSection label="Languages">
          <p className="font-display text-subheading text-ink">
            {joinNames(therapist.languages.map((language) => language.name))}
          </p>
        </ProfileSection>

        <ProfileSection label="Sessions">
          <p className="font-display text-subheading text-ink">
            {joinNames(therapist.sessionFormats.map((format) => format.name))}
          </p>
        </ProfileSection>
      </div>

      <div className="mt-16 flex flex-col items-start gap-6">
        <ButtonLink to={therapistPath(therapist.id)}>
          Read more about {firstNameOnly(therapist.displayName)}
        </ButtonLink>

        {/*
          Present, focusable, and honest. `unavailable` rather than `disabled` so it
          is still announced and still reachable — a control that silently cannot be
          used is worse than one that says why.
        */}
        <Button unavailable unavailableHint="rematch-hint" variant="quiet">
          This feels right
        </Button>
        <p id="rematch-hint" className="text-small text-ink-faint max-w-sm text-pretty">
          Being able to ask for someone else is the next part of this prototype, and it has not been
          built yet.
        </p>

        <p>
          <TextLink to={paths.intake}>Back to your answers</TextLink>
        </p>
      </div>

      <p className="text-small text-ink-faint mt-14 max-w-md text-pretty">
        Every therapist in this prototype is fictional. The reasons above are read from what each of
        them has said about their own work, and nothing you wrote was interpreted.
      </p>

      <p className="mt-6">
        {/*
          The receipt is the only thing this tab kept after the answers were sent,
          and this is where it goes. A prototype with no account should leave
          nothing behind, and "start over" has to mean that.
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
        We couldn’t find someone who fits all of the things you marked as important.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        That is an answer rather than a failure. It means the conditions you set — the things you
        marked as must-haves rather than preferences — are not ones any one person here meets yet.
      </p>

      {/*
        The honest next step, and the one this phase cannot take. Loosening a
        requirement and looking again is real work on the matching side, so the
        control is present, focusable, and says so.
      */}
      <div className="mt-10 flex flex-col items-start gap-6">
        <Button unavailable unavailableHint="rematch-hint" variant="quiet">
          Loosen one thing and look again
        </Button>
        <p id="rematch-hint" className="text-small text-ink-faint max-w-sm text-pretty">
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
        There’s nothing here to explain yet.
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
