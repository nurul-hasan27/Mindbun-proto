import { JourneyPlaceholder } from '../components/JourneyPlaceholder';
import { usePageMeta } from '../lib/usePageMeta';

export function FeedbackPage() {
  usePageMeta({
    title: 'How it felt',
    description: 'Tell us what did not fit, in your own words, and it shapes what happens next.',
  });

  return (
    <JourneyPlaceholder
      stepId="feedback"
      title="If it doesn’t feel right, say so."
      description="This is where you tell us what did not fit, in your own words. It is the most useful thing you can give us, and it is what shapes what happens next."
    />
  );
}
