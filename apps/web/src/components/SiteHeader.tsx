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
 * There is no navigation bar, no menu, and no list of pages.
 *
 *   - on the landing page, a link into the journey
 *   - inside the journey, your position, and nothing else: the step itself
 *     already says what to do next
 *   - outside the journey (a therapist profile), nothing at all, because
 *     offering "Start" from a profile would pretend it is the beginning
 */
export function SiteHeader() {
  const { pathname } = useLocation();
  const stepIndex = journeyIndexOf(pathname);

  return (
    <header className="relative z-10">
      <Container className="border-line flex items-center justify-between gap-4 border-b py-6 sm:gap-6 sm:py-8">
        <Wordmark />
        {stepIndex >= 0 ? (
          <JourneyIndicator currentIndex={stepIndex} />
        ) : (
          pathname === paths.home && <TextLink to={paths.start}>Start</TextLink>
        )}
      </Container>
    </header>
  );
}
