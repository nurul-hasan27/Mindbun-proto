import type { RouteObject } from 'react-router';
import { SiteLayout } from '../layouts/SiteLayout';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { StartPage } from '../pages/StartPage';

/**
 * One route tree, shared by the app (browser router) and the tests (memory
 * router), so what is tested is what ships.
 */
export const routeConfig: RouteObject[] = [
  {
    path: '/',
    element: <SiteLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'start', element: <StartPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
