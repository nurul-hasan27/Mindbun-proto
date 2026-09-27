import { JourneyPlaceholder } from '../components/JourneyPlaceholder';
import { usePageMeta } from '../lib/usePageMeta';

export function IntakePage() {
  usePageMeta({
    title: 'The questions',
    description:
      'A short series of open questions, asked one at a time, in your own words. Arriving in a later phase.',
  });

  return (
    <JourneyPlaceholder
      stepId="intake"
      title="Let’s begin with what matters to you."
      description="A few open questions, one at a time, in whatever words come naturally. No forms scored behind your back, and nothing you would be asked to reveal before you are ready."
    />
  );
}
