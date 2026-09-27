import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../routes/paths';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';

const PLACEHOLDERS = [
  { path: paths.intake, title: /let’s begin with what matters to you/i },
  { path: paths.matching, title: /where a recommendation comes from/i },
  { path: paths.recommendation, title: /one person, and the reasons why/i },
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

  it('steps back from the first placeholder to the start page', () => {
    renderRoute(paths.intake);

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', paths.start);
  });
});
