import { ArrowGlyph } from '../components/ArrowGlyph';
import { ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { Eyebrow } from '../components/Eyebrow';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

export function NotFoundPage() {
  usePageMeta({ title: 'This page isn’t here' });

  return (
    <Container as="section" className="pt-16 pb-8 sm:pt-24">
      <Eyebrow>Not found</Eyebrow>

      <h1 className="font-display text-title mt-6 text-balance">This page isn’t here.</h1>

      <p className="text-lead max-w-measure text-ink-muted mt-6 text-pretty">
        The address may be mistyped, or the link may be older than the page it pointed to. Nothing
        has gone wrong on your side.
      </p>

      <ButtonLink to={paths.home} className="mt-10" trailing={<ArrowGlyph />}>
        Back to the beginning
      </ButtonLink>
    </Container>
  );
}
