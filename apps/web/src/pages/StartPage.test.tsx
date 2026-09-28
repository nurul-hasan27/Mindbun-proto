import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intakePath, paths } from '../routes/paths';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { stubIntakeApi } from '../test/intakeRender';
import { renderRoute } from '../test/renderRoute';

describe('StartPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invites the person to describe what they are looking for', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/start with what you’re looking for/i);
    expect(
      screen.getByText(/the kind of support that fits/i, { exact: false }),
    ).toBeInTheDocument();
  });

  it('keeps a sound heading structure', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    expectSoundHeadingStructure();
  });

  it('shows an example in the person’s own words, which is the product’s whole argument', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    expect(screen.getByText(/the kind of thing you might write/i)).toBeInTheDocument();
    expect(screen.getByText(/honest with me/i)).toBeInTheDocument();
  });

  it('leads into the questions, which now exist', () => {
    stubIntakeApi();
    const { router } = renderRoute(paths.start);

    const continueLink = screen.getByRole('link', { name: /continue/i });
    expect(continueLink).toHaveAttribute('href', intakePath('support'));
    expect(continueLink).not.toHaveAttribute('aria-disabled');

    expect(router.state.location.pathname).toBe(paths.start);
  });

  it('says how long the flow is, without counting every step out loud', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    expect(screen.getByText(/seven short questions, one at a time/i)).toBeInTheDocument();
    expect(screen.getByText(/three of them you can leave blank/i)).toBeInTheDocument();
  });

  it('never promises typing that is not there', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    expect(screen.queryByText(/arrive in a later phase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a later phase of this prototype/i)).not.toBeInTheDocument();
  });

  it('offers a way back to the landing page', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', paths.home);
  });

  it('sets a route-specific document title', () => {
    stubIntakeApi();
    renderRoute(paths.start);

    expect(document.title).toContain('Start with what you are looking for');
  });

  it('lands on the first question when Continue is followed', async () => {
    stubIntakeApi();
    const { router } = renderRoute(paths.start);

    screen.getByRole('link', { name: /continue/i }).click();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(intakePath('support'));
    });
  });
});
