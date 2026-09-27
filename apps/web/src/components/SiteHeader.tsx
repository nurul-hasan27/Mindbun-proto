import { useLocation } from 'react-router';
import { Container } from './Container';
import { JourneyIndicator } from './JourneyIndicator';
import { TextLink } from './TextLink';
import { Wordmark } from './Wordmark';
import { journeyIndexOf } from '../routes/journey';
import { paths } from '../routes/paths';

/**
 * Minimal navigation: a name, and one quiet way onward.
 *
 * There is no navigation bar, no menu, and no list of pages. Outside the journey
 * it offers a way to start; inside the journey it shows where you are and gets
 * out of the way, because the step itself says what to do next.
 */
export function SiteHeader() {
  const { pathname } = useLocation();
  const stepIndex = journeyIndexOf(pathname);
  const inJourney = stepIndex >= 0;

  return (
    <header className="relative z-10">
      <Container className="border-line flex items-center justify-between gap-4 border-b py-6 sm:gap-6 sm:py-8">
        <Wordmark />
        {inJourney ? (
          <JourneyIndicator currentIndex={stepIndex} />
        ) : (
          <TextLink to={paths.start}>Start</TextLink>
        )}
      </Container>
    </header>
  );
}
