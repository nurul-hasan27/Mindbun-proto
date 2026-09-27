import { JourneyPlaceholder } from '../components/JourneyPlaceholder';
import { usePageMeta } from '../lib/usePageMeta';

export function MatchingPage() {
  usePageMeta({
    title: 'Finding a fit',
    description:
      'Where a recommendation comes from, and the reasons behind it, written out in full.',
  });

  return (
    <JourneyPlaceholder
      stepId="matching"
      title="Where a recommendation comes from."
      description="What you describe is compared with what each therapist actually offers, and the comparison is written out in words you can read — never reduced to a score you never see."
    />
  );
}
