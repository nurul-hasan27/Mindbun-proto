import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/renderRoute';

describe('HomePage', () => {
  it('explains the purpose of the prototype', () => {
    renderRoute('/');

    expect(screen.getByText('Why this match')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Understand why we found this therapist for you.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/without turning therapy into therapist shopping/i),
    ).toBeInTheDocument();
  });

  it('navigates to the start page', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await user.click(screen.getByRole('link', { name: 'Start' }));

    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
  });
});
