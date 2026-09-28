import type { RouteObject } from 'react-router';
import { IntakeEntry } from './IntakeEntry';
import { IntakeQuestionPage } from './IntakeQuestionPage';
import { LanguageQuestion } from './LanguageQuestion';
import { AvailabilityQuestion } from './AvailabilityQuestion';
import { AnythingElseQuestion } from './AnythingElseQuestion';
import { IntakeReviewPage } from './IntakeReviewPage';
import { IntakeCompanionPage } from './IntakeCompanionPage';

/**
 * The intake's own routes, nested under `/intake`.
 *
 * Each question has its own URL on purpose. A refresh should return someone to
 * the question they were on, and a shared link should land on a question rather
 * than on a blank shell — so the flow is deep-linkable all the way down, with the
 * draft supplying whatever the URL cannot.
 */
export const intakeRoutes: RouteObject[] = [
  {
    // An explicit path rather than a pathless layout: the questions are mounted
    // as a subtree, and giving the subtree a path keeps that visible in the route
    // tree rather than leaving a parentless-looking entry.
    path: 'intake',
    element: <IntakeEntry />,
    children: [
      { index: true, element: <IntakeQuestionPage questionId="support" /> },
      { path: 'support', element: <IntakeQuestionPage questionId="support" /> },
      { path: 'conversation', element: <IntakeQuestionPage questionId="conversation" /> },
      { path: 'context', element: <IntakeQuestionPage questionId="context" /> },
      { path: 'language', element: <LanguageQuestion /> },
      { path: 'sessions', element: <IntakeQuestionPage questionId="sessions" /> },
      { path: 'availability', element: <AvailabilityQuestion /> },
      { path: 'anything-else', element: <AnythingElseQuestion /> },
      // The conversation assistant. Sited before the first question so it can be reached
      // from the start page without passing through a question, and mounted *inside* the
      // intake so the draft is the same object the questions read and write.
      { path: 'companion', element: <IntakeCompanionPage /> },
      { path: 'review', element: <IntakeReviewPage /> },
    ],
  },
];
