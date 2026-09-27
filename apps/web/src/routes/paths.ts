/** Single source of truth for every internal route. */
export const paths = {
  home: '/',
  start: '/start',
} as const;

export type AppPath = (typeof paths)[keyof typeof paths];
