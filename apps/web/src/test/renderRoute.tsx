import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { routeConfig } from '../routes/router';

type MemoryRouter = ReturnType<typeof createMemoryRouter>;

/**
 * Renders the real route tree at a given URL. Using the production config keeps
 * layout, navigation and metadata honest in tests.
 */
export function renderRoute(initialPath: string): RenderResult & { router: MemoryRouter } {
  const router = createMemoryRouter(routeConfig satisfies RouteObject[], {
    initialEntries: [initialPath],
  });

  return Object.assign(render(<RouterProvider router={router} />), { router });
}
