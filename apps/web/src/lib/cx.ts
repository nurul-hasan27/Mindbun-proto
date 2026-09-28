/**
 * Joins class names, dropping anything falsy. Keeps conditional styling in JSX
 * readable without pulling in a class-name dependency.
 */
export function cx(...values: (string | false | null | undefined)[]): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}
