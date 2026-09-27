import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../routes/paths';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';

describe('StartPage', () => {
  it('invites the person to describe what they are looking for', () => {
    renderRoute(paths.start);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/start with what you’re looking for/i);
    expect(
      screen.getByText(/the kind of support that fits/i, { exact: false }),
    ).toBeInTheDocument();
  });

  it('keeps a sound heading structure', () => {
    renderRoute(paths.start);

    expectSoundHeadingStructure();
  });

  it('marks the primary action as not yet available, and explains why', () => {
    renderRoute(paths.start);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toHaveAttribute('aria-disabled', 'true');

    const note = screen.getByText(/the guided questions arrive in the next phase/i);
    expect(continueButton).toHaveAttribute('aria-describedby', note.id);
  });

  it('offers a way back to the landing page', () => {
    renderRoute(paths.start);

    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', paths.home);
  });

  it('sets a route-specific document title', () => {
    renderRoute(paths.start);

    expect(document.title).toContain('Start with what you are looking for');
  });
});
