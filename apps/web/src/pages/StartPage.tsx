import { ArrowGlyph } from '../components/ArrowGlyph';
import { ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { Eyebrow } from '../components/Eyebrow';
import { TextLink } from '../components/TextLink';
import { usePageMeta } from '../lib/usePageMeta';
import { intakePath, paths } from '../routes/paths';

/**
 * The doorway to the questions.
 *
 * In Phase 1 this promised that typing would arrive later; it does now, so the
 * page keeps only the promise and hands over. The pull-quote stays because it is
 * the one thing on the screen that tells someone what kind of answer this product
 * is after — and it is their words, not ours, which is the point.
 */
export function StartPage() {
  usePageMeta({
    title: 'Start with what you are looking for',
    description:
      'Share what matters to you in your own words. A short series of open questions, asked one at a time.',
  });

  return (
    <section className="wash-quiet">
      <Container className="pt-14 pb-6 sm:pt-20">
        <div className="max-w-2xl">
          {/* The header carries the position; the page only needs a name for itself. */}
          <Eyebrow>Step one</Eyebrow>

          <h1 className="font-display text-title mt-6 text-balance">
            Let’s start with what you’re looking for.
          </h1>

          <p className="text-lead max-w-measure text-ink-muted mt-6 text-pretty">
            Tell us what matters to you — the kind of support that fits, what you’d like to work on,
            and anything that would help you feel comfortable. Plain language is perfect, and you
            can leave anything out.
          </p>

          <figure className="rounded-panel border-line bg-surface shadow-whisper mt-12 border p-7 sm:p-9">
            <figcaption className="text-label text-ink-faint uppercase">
              The kind of thing you might write
            </figcaption>
            <blockquote className="font-display text-subheading text-ink mt-5 text-pretty italic">
              “I’d like someone who is honest with me, who doesn’t make me feel like I’m being
              assessed, and who lets me be quiet for a while.”
            </blockquote>
          </figure>

          <div className="mt-10 flex flex-col items-start gap-5">
            <ButtonLink to={intakePath('support')} trailing={<ArrowGlyph />}>
              Continue
            </ButtonLink>
            <TextLink to={paths.home}>Back</TextLink>
          </div>

          <p className="text-small text-ink-faint mt-10 max-w-md text-pretty">
            Seven short questions, one at a time. Most take a few seconds, and three of them you can
            leave blank.
          </p>
        </div>
      </Container>
    </section>
  );
}
