import { ArrowGlyph } from '../components/ArrowGlyph';
import { ButtonLink } from '../components/Button';
import { Container } from '../components/Container';
import { Eyebrow } from '../components/Eyebrow';
import { OverlapMark } from '../components/OverlapMark';
import { UnderlineMark } from '../components/UnderlineMark';
import { usePageMeta } from '../lib/usePageMeta';
import { paths } from '../routes/paths';

const principles = [
  {
    number: '01',
    title: 'You describe what matters.',
    detail:
      'Not a score assembled behind a form. Plain language, in a space that has no reason to rush you.',
  },
  {
    number: '02',
    title: 'You see the reasoning.',
    detail:
      'Every recommendation arrives with the reasons behind it, written out where you can read them and disagree.',
  },
  {
    number: '03',
    title: 'You can send it back.',
    detail:
      'If the fit feels wrong, you say so — and the next recommendation is made in light of that.',
  },
] as const;

export function LandingPage() {
  usePageMeta({
    title: 'A calmer way to find your therapist',
    description:
      'Why This Match is an independent prototype exploring how therapist matching can be made more transparent.',
  });

  return (
    <>
      <Container
        as="section"
        className="grid gap-14 pt-14 pb-20 sm:pt-20 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pt-28 lg:pb-36"
      >
        <div className="lg:col-span-7">
          <Eyebrow>An independent prototype</Eyebrow>

          <h1 className="font-display text-display mt-8 text-balance">
            A calmer way to find your <UnderlineMark>therapist</UnderlineMark>.
          </h1>

          <p className="text-lead max-w-measure text-ink-muted mt-8 text-pretty">
            We help you understand why a particular therapist was recommended to you — and, if it
            doesn’t feel right, what happens next.
          </p>

          <div className="mt-10 flex flex-col items-start gap-4">
            <ButtonLink to={paths.start} trailing={<ArrowGlyph />}>
              Begin gently
            </ButtonLink>
            <p className="text-small text-ink-muted max-w-lg text-pretty">
              This prototype asks nothing yet. It begins with what you’re looking for.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 lg:pl-8">
          <OverlapMark />
        </div>
      </Container>

      <Container as="section" className="pb-6">
        <Eyebrow as="h2">How this is meant to work</Eyebrow>

        <ol className="border-line mt-10 border-t">
          {principles.map((principle) => (
            <li
              key={principle.number}
              className="border-line grid gap-x-10 gap-y-3 border-b py-9 sm:grid-cols-[3.25rem_1fr] sm:py-11"
            >
              <span className="font-display text-heading text-clay-500 tabular-nums">
                {principle.number}
              </span>
              <div>
                <h3 className="font-display text-heading text-balance">{principle.title}</h3>
                <p className="max-w-measure text-ink-muted mt-3 text-pretty">{principle.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </>
  );
}
