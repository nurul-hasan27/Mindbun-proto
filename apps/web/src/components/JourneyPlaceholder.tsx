import { Container } from './Container';
import { Eyebrow } from './Eyebrow';
import { TextLink } from './TextLink';
import { journey, journeyStepBefore, type JourneyStepId } from '../routes/journey';

interface JourneyPlaceholderProps {
  readonly stepId: JourneyStepId;
  /** The promise this step makes, in the product's voice. */
  readonly title: string;
  /** What the person will be able to do here, honestly described. */
  readonly description: string;
}

const NOT_BUILT_YET =
  'This step is not built yet. Nothing here is stored, and nothing is sent anywhere.';

/**
 * The shared shape of a step that does not exist yet.
 *
 * Each placeholder states what the step will be *for*, rather than announcing
 * that it is missing. The single honest line about the prototype's state is the
 * same everywhere, so it never becomes a novelty.
 */
export function JourneyPlaceholder({ stepId, title, description }: JourneyPlaceholderProps) {
  const step = journey.find((entry) => entry.id === stepId);
  const backTo = journeyStepBefore(stepId);

  return (
    <Container className="pt-14 pb-6 sm:pt-20">
      <div className="max-w-2xl">
        <Eyebrow>{step?.label}</Eyebrow>

        <h1 className="font-display text-title mt-6 text-balance">{title}</h1>

        <p className="text-lead text-ink-muted max-w-measure mt-6 text-pretty">{description}</p>

        <div className="mt-12 flex flex-col items-start gap-5">
          <TextLink to={backTo}>Back</TextLink>
          <p className="text-small text-ink-muted max-w-md text-pretty">{NOT_BUILT_YET}</p>
        </div>
      </div>
    </Container>
  );
}
