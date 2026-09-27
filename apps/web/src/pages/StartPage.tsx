import { ArrowGlyph } from '../components/ArrowGlyph';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { Eyebrow } from '../components/Eyebrow';
import { TextLink } from '../components/TextLink';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

const INTAKE_NOTE_ID = 'intake-note';

/** A still cursor. The prototype is a promise of where typing will happen. */
function Caret() {
  return (
    <span
      aria-hidden="true"
      className="bg-clay-400 ml-1 inline-block h-[0.95em] w-px translate-y-[0.12em] align-baseline"
    />
  );
}

export function StartPage() {
  usePageMeta({
    title: 'Start with what you are looking for',
    description:
      'Share what matters to you in your own words. The guided questions arrive in a later phase of this prototype.',
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
              <Caret />
            </blockquote>
          </figure>

          <div className="mt-10 flex flex-col items-start gap-5">
            <Button
              variant="quiet"
              unavailable
              unavailableHint={INTAKE_NOTE_ID}
              trailing={<ArrowGlyph />}
            >
              Continue
            </Button>
            <p id={INTAKE_NOTE_ID} className="text-small text-ink-muted max-w-md text-pretty">
              Nothing is asked yet. The guided questions arrive in the next phase of this prototype.
            </p>
            <TextLink to={paths.home}>Back</TextLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
