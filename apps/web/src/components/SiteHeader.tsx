import { Container } from './Container';
import { TextLink } from './TextLink';
import { Wordmark } from './Wordmark';
import { paths } from '../routes/paths';

/** Minimal navigation: a name, and one quiet way onward. */
export function SiteHeader() {
  return (
    <header className="relative z-10">
      <Container className="border-line flex items-center justify-between gap-6 border-b py-6 sm:py-8">
        <Wordmark />
        <TextLink to={paths.start}>Start</TextLink>
      </Container>
    </header>
  );
}
