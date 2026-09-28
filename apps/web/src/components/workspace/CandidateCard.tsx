import type { TherapistProfile } from '../../lib/api/types';
import { cx } from '../../lib/cx';
import { Monogram } from '../Monogram';
import { WorkspaceEyebrow } from './WorkspaceColumns';

/**
 * A candidate, with their evidence and what they do not carry.
 *
 * ## Reuse rather than a second visual language
 *
 * The monogram, the attribute lists and the availability formatting are the same
 * components the client profile page uses. A second rendering of a therapist would be a
 * subtle way of implying the internal tool knows something the client page does not, and it
 * would guarantee the two drift apart the first time an attribute is added.
 *
 * What is new here is the `notOffered` line, and it has no client-side counterpart on
 * purpose — see `notOffered.ts` in the API for why a list of absences belongs in front of a
 * matcher and nowhere near a person choosing care.
 */
interface CandidateCardProps {
  readonly therapist: TherapistProfile;
  /** The reasons they share with the client, as the client would read them. */
  readonly shared: readonly { readonly key: string; readonly sentence: string }[];
  readonly notOffered: readonly { readonly category: string; readonly names: readonly string[] }[];
  /** Set when the engine could not show them at all. */
  readonly rejectionCode?: string | null;
  /**
   * Whether to say, once, whose voice the sentences below are in.
   *
   * The evidence is the client's own phrasing — "You said you wanted support with
   * relationships" — and on a page about somebody else that second person is genuinely
   * confusing. Rewriting the sentences for an internal reader would mean a second set of
   * templates free to drift from the first, which is a worse problem than an ambiguous
   * pronoun. So the voice is declared instead, and the declaration earns its place: a
   * reviewer is being shown exactly what the client will be shown, word for word, and
   * that is worth knowing before they disagree with it.
   */
  readonly explainVoice?: boolean;
  className?: string;
}

export function CandidateCard({
  therapist,
  shared,
  notOffered,
  rejectionCode = null,
  explainVoice = false,
  className,
}: CandidateCardProps) {
  return (
    <div className={cx('border-line border-t pt-7', className)}>
      <header className="flex items-start gap-4">
        <Monogram name={therapist.displayName} />
        <div className="min-w-0">
          <h3 className="text-heading font-display">{therapist.displayName}</h3>
          <p className="text-small text-ink-muted mt-1">{therapist.headline}</p>
          <p className="text-small text-ink-faint mt-2">
            {therapist.location} · {therapist.yearsOfExperience} years
          </p>
        </div>
      </header>

      {/*
        The biography, in full, before the attribute lists.
        
        A matcher reading two people needs the part that is not a list, and it is the part
        that most often decides it. Truncating it here would mean deciding on the lists.
      */}
      <p className="text-small text-ink-muted max-w-measure mt-5 text-pretty">{therapist.bio}</p>

      {/*
        The rest of the profile, and none of it behind a control. A reviewer is inspecting
        rather than being shown, and the alternative — a summary with a "see more" — is how
        a reviewer ends up deciding on three lines and calling it a review.
      */}
      <div className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
        <Attribute label="Works with" values={therapist.areasOfWork} />
        <Attribute label="Talks like" values={therapist.communicationStyles} />
        <Attribute label="Approach" values={therapist.approaches} />
        <Attribute label="Experience" values={therapist.contextualExperience} />
        <Attribute label="Speaks" values={therapist.languages} />
        <Attribute label="Sessions" values={therapist.sessionFormats} />
      </div>

      {therapist.availability.length > 0 && (
        <p className="text-small text-ink-muted mt-5">
          <span className="text-ink">Usually free </span>
          {therapist.availability
            .map((window) => `${window.dayOfWeek.toLowerCase()} ${formatRange(window)}`)
            .join(', ')}
        </p>
      )}

      {/*
        The evidence, in the client's own reading of it.

        The same sentences the client would see, deliberately. A reviewer reasoning from
        different wording than the client is a reviewer reasoning about a different
        understanding of the match, and the difference would be invisible.
      */}
      <div className="border-line mt-6 border-t pt-6">
        <WorkspaceEyebrow as="h4">Why this could work</WorkspaceEyebrow>
        {explainVoice && (
          <p className="text-small text-ink-faint mt-2">
            In the client’s words — these are the reasons they will be given, word for word.
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {shared.map((reason) => (
            <li key={reason.key} className="text-small text-ink-muted flex gap-3">
              <span aria-hidden="true" className="text-clay-600 select-none">
                ·
              </span>
              <span>{reason.sentence}</span>
            </li>
          ))}
        </ul>
      </div>

      {notOffered.length > 0 && (
        <div className="border-line mt-6 border-t pt-6">
          <WorkspaceEyebrow as="h4">Not what they offered</WorkspaceEyebrow>
          <ul className="mt-3 flex flex-col gap-2">
            {notOffered.map((gap) => (
              <li key={gap.category} className="text-small text-ink-muted">
                <span className="text-ink">{labelFor(gap.category)}: </span>
                {gap.names.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejectionCode !== null && (
        <p className="text-small text-ink-muted mt-6">
          The engine set this one aside: {readableRejection(rejectionCode)}. They cannot be chosen.
        </p>
      )}
    </div>
  );
}

function Attribute({
  label,
  values,
}: {
  label: string;
  readonly values: readonly { readonly key: string; readonly name: string }[];
}) {
  return (
    <div>
      <WorkspaceEyebrow>{label}</WorkspaceEyebrow>
      {/*
        Empty when the attribute is simply not recorded, which is different from being
        empty. A therapist who has not listed an approach has not said they have none, and
        printing "None" would be a claim about them.
      */}
      <p className="text-small text-ink mt-2">{values.map((value) => value.name).join(' · ')}</p>
    </div>
  );
}

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  AREA_OF_WORK: 'Work with',
  CONTEXTUAL_EXPERIENCE: 'Experience',
  COMMUNICATION_STYLE: 'Style',
  THERAPEUTIC_APPROACH: 'Approach',
  LANGUAGE: 'Language',
  SESSION_FORMAT: 'Sessions',
  AVAILABILITY: 'Times',
};

function labelFor(category: string): string {
  return CATEGORY_LABEL[category] ?? category.toLowerCase().replaceAll('_', ' ');
}

/**
 * The rejection code, in words.
 *
 * The engine's own key, mapped to a sentence a matcher can act on, with the key as the
 * fallback. A key shown raw would be a bug report waiting to happen, and a code mapped
 * wrong would be worse than one left alone — so this maps only the codes the engine can
 * actually produce, and anything else degrades to the key rather than to a guess.
 */
const REJECTION: Readonly<Record<string, string>> = {
  NO_SHARED_LANGUAGE: 'no shared language',
  NO_SHARED_SESSION_FORMAT: 'no session format they accept',
  REQUIREMENT_NOT_MET: 'something the client marked as important',
};

function readableRejection(code: string): string {
  return REJECTION[code] ?? code.toLowerCase().replaceAll('_', ' ');
}

function formatRange(window: { readonly startMinute: number; readonly endMinute: number }): string {
  return `${clock(window.startMinute)}–${clock(window.endMinute)}`;
}

function clock(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
