import type { RouteObject } from 'react-router';
import { SiteLayout } from '../layouts/SiteLayout';
import { FeedbackPage } from '../pages/FeedbackPage';
import { LandingPage } from '../pages/LandingPage';
import { MatchingPage } from '../pages/MatchingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RecommendationPage } from '../pages/RecommendationPage';
import { RematchPage } from '../pages/RematchPage';
import { StartPage } from '../pages/StartPage';
import { TherapistProfilePage } from '../pages/TherapistProfilePage';
import { intakeRoutes } from '../pages/intake/routes';

/**
 * One route tree, shared by the app (browser router) and the tests (memory
 * router), so what is tested is what ships.
 *
 * `/`, `/start` and the whole of `/intake` are implemented. The remaining
 * journey routes are deliberate placeholders: they render the shared
 * `JourneyPlaceholder` and will each grow into its own page as the flow is
 * built. The splat route keeps deep links honest rather than silently landing on
 * the home page.
 */
export const routeConfig: RouteObject[] = [
  {
    path: '/',
    element: <SiteLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'start', element: <StartPage /> },
      // The intake brings its own nested routes, including the index that makes
      // `/intake` the first question.
      ...intakeRoutes,
      { path: 'matching', element: <MatchingPage /> },
      { path: 'recommendation', element: <RecommendationPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'rematch', element: <RematchPage /> },

      // Outside the client journey on purpose: a profile is something a
      // recommendation will point at, and it is reached from there rather than
      // from the journey itself. The journey indicator is hidden here too.
      { path: 'therapists/:id', element: <TherapistProfilePage /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
