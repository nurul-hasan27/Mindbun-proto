import { paths, type AppPath } from './paths';

/**
 * The shape of the journey a person takes once they choose to begin.
 *
 * This list is the order of the steps, the wording used for the position
 * indicator, and the only place that knows which of those steps exist yet. The
 * landing page is deliberately not a step — it is the doorway, not part of the
 * sequence.
 *
 * `state: 'planned'` means the step is a deliberate placeholder: it states what it
 * will be for, and nothing in the interface pretends otherwise. `ready` means the
 * step works.
 */
export interface JourneyStep {
  readonly id: 'start' | 'intake' | 'matching' | 'recommendation' | 'feedback' | 'rematch';
  readonly path: AppPath;
  /** Plain name for assistive technology. */
  readonly label: string;
  readonly state: 'ready' | 'planned';
}

export const journey = [
  { id: 'start', path: paths.start, label: 'Start', state: 'ready' },
  { id: 'intake', path: paths.intake, label: 'The questions', state: 'ready' },
  { id: 'matching', path: paths.matching, label: 'Finding a fit', state: 'planned' },
  {
    id: 'recommendation',
    path: paths.recommendation,
    label: 'The recommendation',
    state: 'ready',
  },
  { id: 'feedback', path: paths.feedback, label: 'How it felt', state: 'planned' },
  { id: 'rematch', path: paths.rematch, label: 'A second look', state: 'planned' },
] as const satisfies readonly JourneyStep[];

export type JourneyStepId = (typeof journey)[number]['id'];

/**
 * Index of the step a path belongs to, or -1 when the path is outside the journey.
 *
 * The intake is one step spread over several addresses, so it matches on its path
 * *and* everything under it. Without that, the position indicator would vanish the
 * moment someone answered their first question, which is the opposite of when it
 * is most useful.
 */
export function journeyIndexOf(pathname: string): number {
  return journey.findIndex(
    (step) => pathname === step.path || pathname.startsWith(`${step.path}/`),
  );
}

/** The step before the given one. The first step falls back to the landing page. */
export function journeyStepBefore(stepId: JourneyStepId): AppPath {
  const index = journey.findIndex((step) => step.id === stepId);
  const previous = journey[index - 1];

  return previous === undefined ? paths.home : previous.path;
}
