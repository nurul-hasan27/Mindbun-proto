import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../routes/paths';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';

// The intake (Phase 4) and the recommendation (Phase 5) are both built, so neither
// is one of these any more.
const PLACEHOLDERS = [
  { path: paths.matching, title: /where a recommendation comes from/i },
  { path: paths.feedback, title: /if it doesn’t feel right, say so/i },
  { path: paths.rematch, title: /another attempt, informed by you/i },
] as const;

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

  it('steps back to the step before it, which is the intake', () => {
    renderRoute(paths.matching);

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', paths.intake);
  });
});
