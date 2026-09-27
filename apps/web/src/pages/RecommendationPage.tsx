import { JourneyPlaceholder } from '../components/JourneyPlaceholder';
import { usePageMeta } from '../lib/usePageMeta';

export function RecommendationPage() {
  usePageMeta({
    title: 'The recommendation',
    description: 'One person, and the reasons behind them, written out in full.',
  });

  return (
    <JourneyPlaceholder
      stepId="recommendation"
      title="One person, and the reasons why."
      description="A single recommendation with its reasoning laid out beside it, so you can read it properly, question it, and decide it is not for you."
    />
  );
}
