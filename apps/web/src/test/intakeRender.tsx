import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { IntakeVocabulary } from '../lib/api/types';
import { renderRoute } from './renderRoute';

/**
 * Test vocabulary.
 *
 * A trimmed copy of what the seed produces, with the keys the questions actually
 * map to. Deliberately not fetched: a test that depends on a running backend is a
 * test that fails for reasons that have nothing to do with the code.
 */
export const TEST_VOCABULARY: IntakeVocabulary = {
  areasOfWork: [
    { key: 'relationships', name: 'Relationships' },
    { key: 'career-transitions', name: 'Career transitions' },
    { key: 'family-dynamics', name: 'Family dynamics' },
    { key: 'life-transitions', name: 'Life transitions' },
    { key: 'burnout', name: 'Burnout' },
  ],
  communicationStyles: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'structured', name: 'Structured' },
    { key: 'reflective', name: 'Reflective' },
    { key: 'solution-focused', name: 'Solution-focused' },
  ],
  contextualExperience: [
    { key: 'indian-diaspora', name: 'Indian diaspora' },
    { key: 'cross-cultural-relationships', name: 'Cross-cultural relationships' },
    { key: 'relocation', name: 'Relocation' },
    { key: 'international-students', name: 'International students' },
    { key: 'third-culture-upbringing', name: 'Third culture upbringing' },
  ],
  languages: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'bn', name: 'Bengali' },
    { code: 'ta', name: 'Tamil' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'ur', name: 'Urdu' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'fr', name: 'French' },
  ],
  sessionFormats: [
    { key: 'online', name: 'Online' },
    { key: 'in-person', name: 'In person' },
  ],
};

const RECEIPT = {
  intakeId: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7ea',
  receivedAt: '2026-09-28T12:00:00.000Z',
};

export interface StubOptions {
  /** Replaces the vocabulary, for testing a service that does not know the terms. */
  readonly vocabulary?: unknown;
  readonly vocabularyStatus?: number;
  /** Held until `releaseSubmit` is called, for testing the saving state. */
  readonly holdSubmit?: boolean;
  /** Fails the POST, for testing the recovery state. */
  readonly failSubmit?: boolean;
}

export interface RecordedRequest {
  readonly url: string;
  /** The parsed body, so a test can assert on what the service would receive. */
  readonly body: unknown;
}

export interface StubbedApi {
  readonly requests: readonly RecordedRequest[];
  readonly releaseSubmit: () => void;
}

/**
 * Stubs the two intake endpoints, and only those.
 *
 * Answering is URL-aware because the development footer also asks for a page of
 * therapists and a health check; a test should not depend on which component
 * asked first.
 */
export function stubIntakeApi(options: StubOptions = {}): StubbedApi {
  const requests: RecordedRequest[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const health = {
    status: 'ok',
    service: 'why-this-match-api',
    version: '0.3.0',
    timestamp: '2026-09-28T12:00:00.000Z',
  };

  const therapist = {
    id: '0199a1c2-3d4e-5f60-8712-93a4b5c6d7eb',
    displayName: 'Aditi Bhattacharya',
    headline: 'Gentle, exploratory, unhurried',
    location: 'Kolkata, India',
    timezone: 'Asia/Kolkata',
    yearsOfExperience: 5,
    languages: [{ key: 'bn', name: 'Bengali' }],
    areasOfWork: [{ key: 'relationships', name: 'Relationships' }],
    communicationStyles: [{ key: 'gentle', name: 'Gentle' }],
  };

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : '';

      if (init?.method === 'POST' && url.includes('/intakes')) {
        requests.push({
          url,
          body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
        });

        if (options.failSubmit === true) {
          return respond(
            {
              statusCode: 503,
              error: 'Service Unavailable',
              message: 'We could not reach where answers are stored right now.',
            },
            503,
          );
        }

        if (options.holdSubmit === true) {
          await gate;
        }

        return respond(RECEIPT);
      }

      if (url.includes('/intake/vocabulary')) {
        return respond(options.vocabulary ?? TEST_VOCABULARY, options.vocabularyStatus ?? 200);
      }

      if (url.includes('/api/v1/health')) {
        return respond(health);
      }

      if (url.includes('/therapists/')) {
        return respond(therapist);
      }

      if (url.includes('/api/v1/therapists')) {
        return respond({
          items: [therapist],
          pagination: { total: 1, take: 1, skip: 0, hasMore: false },
        });
      }

      return respond(null, 404);
    }),
  );

  return { requests, releaseSubmit: () => release() };
}

/**
 * Renders an intake route and waits for its vocabulary to arrive.
 *
 * Polls for the absence of the loading copy rather than asserting a positive,
 * so a genuinely broken page fails on its own assertion later with a readable
 * message instead of here with a bare timeout.
 */
export async function renderIntake(path: string) {
  const result = renderRoute(path);

  await waitFor(
    () => {
      if (screen.queryByText(/getting the questions ready|getting the list ready/i) !== null) {
        throw new Error('still waiting for the intake vocabulary');
      }
    },
    { timeout: 2_000 },
  );

  return result;
}

/** Answers a question by clicking its visible label. */
export async function choose(label: string | RegExp): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
}

/** Chooses a single-answer option. */
export async function chooseOnly(label: string | RegExp): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: new RegExp(label) }));
}

export async function pressContinue(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Continue$/ }));
}

export { userEvent };
