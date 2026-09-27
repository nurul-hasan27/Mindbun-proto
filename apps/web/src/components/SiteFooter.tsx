import { Container } from './Container';
import { DevStatus } from './DevStatus';
import { isDev } from '../lib/api';

/** A footnote, not a footer: what this is, and what it is not. */
export function SiteFooter() {
  return (
    <footer className="mt-section">
      <Container className="border-line flex flex-col gap-3 border-t pt-8 pb-10 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10">
        <div className="flex flex-col gap-1">
          <p className="text-small text-ink-muted">
            Why This Match — an independent prototype, not a healthcare service.
          </p>
          <p className="text-small text-ink-muted">
            Every therapist, quote and match in this prototype is fictional.
          </p>
        </div>
        {isDev && <DevStatus />}
      </Container>
    </footer>
  );
}
