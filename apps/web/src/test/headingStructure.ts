import { expect } from 'vitest';

/**
 * Structural accessibility check: exactly one `h1`, it comes first, and no
 * level is ever skipped on the way down. Cheap to run, expensive to get wrong.
 */
export function expectSoundHeadingStructure(): void {
  const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) =>
    Number(heading.tagName.slice(1)),
  );

  const [first, ...rest] = levels;
  expect(levels.length).toBeGreaterThan(0);
  expect(first).toBe(1);
  expect(levels.filter((level) => level === 1)).toHaveLength(1);

  let previous = first ?? 1;
  for (const level of rest) {
    expect(level).toBeLessThanOrEqual(previous + 1);
    previous = level;
  }
}
