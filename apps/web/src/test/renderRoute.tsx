import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes/router';

/** Renders the real route tree at the given path using an in-memory router. */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}
