/** Single source of truth for every internal route. */
export const paths = {
  home: '/',
  start: '/start',
  intake: '/intake',
  matching: '/matching',
  recommendation: '/recommendation',
  feedback: '/feedback',
  rematch: '/rematch',
} as const;

export type AppPath = (typeof paths)[keyof typeof paths];

/** Builds a therapist profile path from an id. */
export function therapistPath(id: string): string {
  return `/therapists/${encodeURIComponent(id)}`;
}

/**
 * The intake is one journey step spread over several questions, so each has its
 * own URL: a refresh or a shared link should return to the question someone was
 * on rather than to the beginning of the flow.
 */
export function intakePath(question: string): string {
  return `${paths.intake}/${question}`;
}

export const intakeReviewPath = `${paths.intake}/review`;
