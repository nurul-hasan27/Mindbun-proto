import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/renderRoute';

describe('StartPage', () => {
  it('renders a placeholder without collecting data', () => {
    renderRoute('/start');

    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText(/placeholder for the guided intake flow/i)).toBeInTheDocument();
    expect(document.querySelector('form')).toBeNull();
  });
});
