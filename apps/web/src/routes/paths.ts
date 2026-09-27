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
