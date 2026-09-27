import { useParams } from 'react-router';
import { Container } from '../components/Container';
import { ErrorNote } from '../components/ErrorNote';
import { LoadingNote } from '../components/LoadingNote';
import { Monogram } from '../components/Monogram';
import { ProfileSection } from '../components/ProfileSection';
import { TextLink } from '../components/TextLink';
import { getTherapist, type AttributeView, type TherapistProfile } from '../lib/api';
import { describeTimezone, formatWindow, joinNames } from '../lib/format';
import { useApiResource } from '../lib/useApiResource';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

function names(attributes: readonly AttributeView[]): string {
  return joinNames(attributes.map((attribute) => attribute.name));
}

/** "There is no such profile" is a different thing from "the service is down". */
function isMissingProfile(error: {
  readonly kind: string;
  readonly status: number | null;
}): boolean {
  return error.kind === 'http' && error.status === 404;
}

/**
 * One therapist, described.
 *
 * A profile, not a listing: no score, no rank, no reviews, no "best match".
 * Everything on it is something the therapist stated about themselves, and the
 * only action anywhere on the page is a way back.
 */
export function TherapistProfilePage() {
  const { id = '' } = useParams();
  const { state, retry } = useApiResource(
    (signal) => getTherapist(id, undefined, { signal }),
    [id],
  );

  usePageMeta({ title: state.status === 'ready' ? state.data.displayName : 'A therapist' });

  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      {state.status === 'loading' && <LoadingNote>Finding their profile…</LoadingNote>}

      {state.status === 'error' &&
        (isMissingProfile(state.error) ? (
          <NoProfileHere />
        ) : (
          <ErrorNote error={state.error} onRetry={retry} />
        ))}

      {state.status === 'ready' && <Profile profile={state.data} />}
    </Container>
  );
}

function NoProfileHere() {
  return (
    <div className="max-w-2xl">
      <p className="text-label text-ink-faint uppercase">No profile here</p>

      <h1 className="font-display text-title mt-6 text-balance">
        We don’t have anyone at this address.
      </h1>

      <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">
        The link may be old, or the id may have been mistyped. Nothing has gone wrong on your side.
      </p>

      <p className="mt-10">
        <TextLink to={paths.home}>Back to the beginning</TextLink>
      </p>
    </div>
  );
}

function Profile({ profile }: { readonly profile: TherapistProfile }) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-start gap-5 sm:gap-7">
        <Monogram name={profile.displayName} />
        <div className="min-w-0">
          <h1 className="font-display text-title text-balance">{profile.displayName}</h1>
          <p className="text-label text-clay-700 mt-4 uppercase">{profile.headline}</p>
        </div>
      </div>

      <p className="text-lead text-ink-muted mt-10 text-pretty">{profile.bio}</p>

      <p className="text-small text-ink-faint mt-6">
        {profile.location} · {profile.yearsOfExperience} years in practice
      </p>

      <div className="mt-14 flex flex-col gap-12">
        <ProfileSection label="Works with">
          <ul className="flex flex-col gap-3">
            {profile.areasOfWork.map((area) => (
              <li key={area.key} className="font-display text-heading text-ink">
                {area.name}
              </li>
            ))}
          </ul>
        </ProfileSection>

        {/* Two labelled lines rather than one section with two unlabelled ones:
            a reader should not have to guess which is the style and which is the
            method. */}
        <ProfileSection label="How they show up">
          <p className="font-display text-subheading text-ink text-balance">
            {names(profile.communicationStyles)}
          </p>
        </ProfileSection>

        <ProfileSection label="Approach">
          <p className="font-display text-subheading text-ink text-balance">
            {names(profile.approaches)}
          </p>
        </ProfileSection>

        <ProfileSection label="Languages">
          <p className="font-display text-subheading text-ink">{names(profile.languages)}</p>
        </ProfileSection>

        {profile.contextualExperience.length > 0 && (
          <ProfileSection label="Context they know">
            <p className="font-display text-subheading text-ink text-balance">
              {names(profile.contextualExperience)}
            </p>
          </ProfileSection>
        )}

        <ProfileSection label="Sessions">
          <p className="font-display text-subheading text-ink">{names(profile.sessionFormats)}</p>
        </ProfileSection>

        {profile.availability.length > 0 && (
          <ProfileSection label="Usually free">
            <ul className="text-body text-ink flex flex-col gap-2">
              {profile.availability.map((window) => (
                <li key={`${window.dayOfWeek}-${window.startMinute}`}>{formatWindow(window)}</li>
              ))}
            </ul>
            <p className="text-small text-ink-faint mt-4">
              Local time in {describeTimezone(profile.timezone)}
            </p>
          </ProfileSection>
        )}
      </div>

      <p className="mt-14">
        <TextLink to={paths.home}>Back to the beginning</TextLink>
      </p>

      <p className="text-small text-ink-faint mt-10 max-w-md text-pretty">
        Every therapist in this prototype is fictional, and nothing here is a clinical assessment.
      </p>
    </div>
  );
}
