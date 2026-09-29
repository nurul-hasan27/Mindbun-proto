import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../routes/paths';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';

/**
 * The one step of the journey that is still a placeholder.
 *
 * This file used to cover `/matching`, `/feedback` and `/rematch`. Two of those are
 * built now, and a test whose subject no longer exists is worse than no test: it passes
 * by asserting the absence of a thing nobody is building, and it fails the moment
 * someone does the work. So it now covers the step that genuinely is not built, and the
 * honest thing about a placeholder is tested here.
 *
 * `/matching` and `/feedback` are covered by their own suites.
 */
const PLACEHOLDERS = [{ path: paths.rematch, title: /another attempt, informed by you/i }] as const;

describe('journey placeholders', () => {
  it.each(PLACEHOLDERS)('$path states what the step is for', ({ path, title }) => {
    renderRoute(path);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  });

  it.each(PLACEHOLDERS)('$path is honest about not being built yet', ({ path }) => {
    renderRoute(path);

    expect(screen.getByText(/this step is not built yet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing here is stored/i)).toBeInTheDocument();
  });

  it.each(PLACEHOLDERS)('$path never says "coming soon"', ({ path }) => {
    renderRoute(path);

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it.each(PLACEHOLDERS)('$path keeps a sound heading structure', ({ path }) => {
    renderRoute(path);

    expectSoundHeadingStructure();
  });

  it('steps back to the step before it, which is now the feedback page', () => {
    // The back-link follows the journey rather than a hardcoded path, so when the
    // feedback page was built this moved with it. Asserting `/intake` here would have
    // been asserting a stale copy, and would have passed while the page was wrong.
    renderRoute(paths.rematch);

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', paths.feedback);
  });

  it('does not claim to have learned anything', () => {
    // The word a placeholder is most tempted by, and the one this project is most
    // careful about. Asserted on the page rather than in prose so that a future copy
    // edit cannot reintroduce it unnoticed.
    renderRoute(paths.rematch);

    const page = (document.body.textContent ?? '').toLowerCase();

    expect(page).not.toMatch(/\b(we (now )?(know|learned|understand) you|smarter|better at)\b/);
  });
});
