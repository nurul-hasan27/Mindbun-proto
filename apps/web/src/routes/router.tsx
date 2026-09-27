import type { RouteObject } from 'react-router';
import { SiteLayout } from '../layouts/SiteLayout';
import { FeedbackPage } from '../pages/FeedbackPage';
import { IntakePage } from '../pages/IntakePage';
import { LandingPage } from '../pages/LandingPage';
import { MatchingPage } from '../pages/MatchingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RecommendationPage } from '../pages/RecommendationPage';
import { RematchPage } from '../pages/RematchPage';
import { StartPage } from '../pages/StartPage';

/**
 * One route tree, shared by the app (browser router) and the tests (memory
 * router), so what is tested is what ships.
 *
 * `/` and `/start` are implemented. The remaining journey routes are deliberate
 * placeholders: they render the shared `JourneyPlaceholder` and will each grow
 * into their own page as the flow is built. The splat route keeps deep links
 * honest rather than silently landing on the home page.
 */
export const routeConfig: RouteObject[] = [
  {
    path: '/',
    element: <SiteLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'start', element: <StartPage /> },
      { path: 'intake', element: <IntakePage /> },
      { path: 'matching', element: <MatchingPage /> },
      { path: 'recommendation', element: <RecommendationPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'rematch', element: <RematchPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
