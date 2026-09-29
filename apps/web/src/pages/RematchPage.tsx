import { JourneyPlaceholder } from '../components/JourneyPlaceholder';
import { usePageMeta } from '../lib/usePageMeta';

export function RematchPage() {
  usePageMeta({
    title: 'A second look',
    description: 'The next recommendation is made in light of what you just told us.',
  });

  return (
    <JourneyPlaceholder
      stepId="rematch"
      title="Another attempt, informed by you."
      description="The next recommendation is made in light of what you have just told us, rather than starting over from the beginning."
    />
  );
}
