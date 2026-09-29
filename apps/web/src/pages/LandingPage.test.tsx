import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../routes/paths';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';

describe('LandingPage', () => {
  it('states the promise in a single top-level heading', () => {
    renderRoute(paths.home);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/a calmer way to find your therapist/i);
  });

  it('keeps a sound heading structure', () => {
    renderRoute(paths.home);

    expectSoundHeadingStructure();
  });

  it('offers one primary way onward', () => {
    renderRoute(paths.home);

    const cta = screen.getByRole('link', { name: /begin gently/i });
    expect(cta).toHaveAttribute('href', paths.start);
  });

  it('explains why a therapist is recommended, without marketing language', () => {
    renderRoute(paths.home);

    expect(
      screen.getByText(/understand why a particular therapist was recommended to you/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ai[- ]powered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pricing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/testimonial/i)).not.toBeInTheDocument();
  });

  it('sets the document title for the route', () => {
    renderRoute(paths.home);

    expect(document.title).toContain('A calmer way to find your therapist');
  });

  it('lists the three ideas the product is built on', () => {
    renderRoute(paths.home);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /you describe what matters/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /you see the reasoning/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /you can send it back/i })).toBeInTheDocument();
  });

  it('is honest about what this is', () => {
    renderRoute(paths.home);

    expect(
      screen.getByText(/independent prototype, not a healthcare service/i),
    ).toBeInTheDocument();
  });
});
