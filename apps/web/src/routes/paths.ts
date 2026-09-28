/** Single source of truth for every internal route. */
export const paths = {
  home: '/',
  start: '/start',
  intake: '/intake',
  matching: '/matching',
  recommendation: '/recommendation',
  feedback: '/feedback',
  rematch: '/rematch',
  matchingWorkspace: '/matching-workspace',
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

/**
 * The internal reviewer's tool. Outside the client journey on purpose.
 *
 * Its own key rather than a parameter of some existing path, so that the journey's position
 * indicator cannot appear on it, the client journey's routes cannot nest inside it, and a
 * link to it is greppable as a group when the day comes to put it behind a sign-in.
 */
export const workspacePaths = {
  queue: '/matching-workspace',
} as const;

export function workspaceCasePath(matchId: string): string {
  return `${workspacePaths.queue}/${encodeURIComponent(matchId)}`;
}
