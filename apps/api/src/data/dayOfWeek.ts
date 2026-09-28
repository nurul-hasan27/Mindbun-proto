/**
 * The days of the week, as the database stores them.
 *
 * Lives apart from any one domain because a therapist's availability and a
 * client's availability are the same concept measured on two sides, and the two
 * repositories have to agree about the words.
 */
export const DAY_NAMES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type DayName = (typeof DAY_NAMES)[number];

export function isDayName(value: string): value is DayName {
  return (DAY_NAMES as readonly string[]).includes(value);
}
