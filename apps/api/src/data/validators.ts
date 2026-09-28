/**
 * Small checks shared by more than one domain.
 *
 * Both a therapist's availability and a client's say the same thing about a
 * time of day, so both need to agree on what an IANA zone name looks like.
 */

/**
 * A conservative IANA check. A real zone is `Area/Location`
 * (`Europe/London`), a sub-zone path (`America/Argentina/Buenos_Aires`), or one
 * of the few single-segment names. `GMT+5:30` and `nope` are not zones, and a
 * bare UTC offset is exactly what this model refuses to store.
 */
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/;

const SINGLE_SEGMENT_ZONES = new Set(['UTC', 'GMT', 'Z', 'CET', 'EET', 'WET', 'EST', 'MST', 'HST']);

export function isIanaTimezone(value: string): boolean {
  return TIMEZONE_PATTERN.test(value) || SINGLE_SEGMENT_ZONES.has(value);
}

/** Used where an identifier has to be a UUID before it is worth a database call. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
