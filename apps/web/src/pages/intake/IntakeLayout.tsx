import { Outlet } from 'react-router';
import { Container } from '../../components/Container';
import { ErrorNote } from '../../components/ErrorNote';
import { LoadingNote } from '../../components/LoadingNote';
import { TextLink } from '../../components/TextLink';
import { useIntake } from '../../lib/intake/intakeContext';
import { usePageMeta } from '../../lib/usePageMeta';
import { paths } from '../../routes/paths';

/**
 * The frame the whole intake shares.
 *
 * Its real job is to wait for the vocabulary before any question renders. The
 * questions offer terms that come from the database, and a question whose list
 * failed to load would offer a person nothing — or, worse, offer the wrong list.
 * So the flow holds here and says why, in one quiet line.
 *
 * A 503 is not a dead end: someone who has answered four questions and then lost
 * the network should be able to reload and carry on, so the message says what
 * will happen rather than apologising.
 */
export function IntakeLayout() {
  const { vocabulary, vocabularyError } = useIntake();

  usePageMeta({
    title: 'A few questions',
    description:
      'A short series of open questions, one at a time, in whatever words come naturally.',
  });

  if (vocabularyError !== null) {
    return (
      <Container className="pt-14 pb-6 sm:pt-20">
        <div className="max-w-2xl">
          <ErrorNote error={vocabularyError} onRetry={() => globalThis.location.reload()} />
          <p className="text-small text-ink-muted mt-6 text-pretty">
            Nothing you have already answered has been lost — reloading will bring the questions
            back.
          </p>
          <p className="mt-8">
            <TextLink to={paths.start}>Back</TextLink>
          </p>
        </div>
      </Container>
    );
  }

  if (vocabulary === null) {
    return (
      <Container className="pt-14 pb-6 sm:pt-20">
        <div className="max-w-2xl">
          <LoadingNote>Getting the questions ready…</LoadingNote>
        </div>
      </Container>
    );
  }

  return <Outlet />;
}
