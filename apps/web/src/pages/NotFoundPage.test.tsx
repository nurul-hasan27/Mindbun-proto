import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../routes/paths';
import { renderRoute } from '../test/renderRoute';

describe('NotFoundPage', () => {
  it('explains the situation and offers a way back', () => {
    renderRoute('/a-page-that-does-not-exist');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/this page isn’t here/i);
    expect(screen.getByRole('link', { name: /back to the beginning/i })).toHaveAttribute(
      'href',
      paths.home,
    );
  });
});
