import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectSoundHeadingStructure } from '../test/headingStructure';
import { renderRoute } from '../test/renderRoute';
import { therapistPath } from '../routes/paths';

const ID = '02004680-bd62-4f61-8fde-35a61b79dfdc';

const PROFILE = {
  id: ID,
  displayName: 'Ananya Mehra',
  headline: 'Warm, curious, reflective',
  bio: 'Therapy can be a place to slow down, and I try to make that possible from the first few minutes.',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 9,
  languages: [
    { key: 'en', name: 'English' },
    { key: 'hi', name: 'Hindi' },
    { key: 'kn', name: 'Kannada' },
  ],
  approaches: [
    { key: 'exploratory', name: 'Exploratory' },
    { key: 'reflective', name: 'Reflective' },
  ],
  areasOfWork: [
    { key: 'career-transitions', name: 'Career transitions' },
    { key: 'relationships', name: 'Relationships' },
  ],
  communicationStyles: [
    { key: 'warm', name: 'Warm' },
    { key: 'curious', name: 'Curious' },
  ],
  contextualExperience: [{ key: 'indian-diaspora', name: 'Indian diaspora' }],
  sessionFormats: [
    { key: 'online', name: 'Online' },
    { key: 'in-person', name: 'In person' },
  ],
  availability: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 }],
} as const;

const SUMMARY = {
  id: ID,
  displayName: 'Ananya Mehra',
  headline: 'Warm, curious, reflective',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 9,
  languages: [{ key: 'en', name: 'English' }],
  areasOfWork: [{ key: 'career-transitions', name: 'Career transitions' }],
  communicationStyles: [{ key: 'warm', name: 'Warm' }],
} as const;

const HEALTH = {
  status: 'ok',
  service: 'why-this-match-api',
  version: '0.3.0',
  timestamp: '2026-09-28T10:00:00.000Z',
} as const;

/**
 * The default client reads the global fetch, so that is all a test needs. The
 * stub is URL-aware because the development footer also asks for health and for
 * a page of therapists, and a test should not depend on which asked first.
 */
function stubApi(
  handler: (url: string) => { status?: number; json?: unknown } = (url) => {
    if (url.includes('/api/v1/health')) {
      return { json: HEALTH };
    }
    if (url.includes('/therapists/')) {
      return { json: PROFILE };
    }
    return {
      json: { items: [SUMMARY], pagination: { total: 1, take: 1, skip: 0, hasMore: false } },
    };
  },
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : '';
      const result = handler(url);
      return Promise.resolve(
        new Response(JSON.stringify(result.json ?? null), {
          status: result.status ?? 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TherapistProfilePage', () => {
  it('describes the person, in their own words', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    expect(screen.getByText('Warm, curious, reflective')).toBeInTheDocument();
    expect(screen.getByText(/Therapy can be a place to slow down/)).toBeInTheDocument();
    expect(screen.getByText(/Bengaluru, India · 9 years in practice/)).toBeInTheDocument();
  });

  it('shows the structured attributes as readable lists, not as a data table', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    expect(screen.getByRole('heading', { name: 'Works with' })).toBeInTheDocument();
    expect(screen.getByText('Career transitions')).toBeInTheDocument();
    expect(screen.getByText('English · Hindi · Kannada')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approach' })).toBeInTheDocument();
    expect(screen.getByText('Exploratory · Reflective')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How they show up' })).toBeInTheDocument();
    expect(screen.getByText('Indian diaspora')).toBeInTheDocument();
    expect(screen.getByText('Online · In person')).toBeInTheDocument();
  });

  it('shows availability in the therapist own time', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    expect(screen.getByText('Tuesdays 18:00–20:00')).toBeInTheDocument();
    expect(screen.getByText(/Local time in India Standard Time/)).toBeInTheDocument();
  });

  it('uses a monogram rather than a photograph', async () => {
    stubApi();
    const { container } = renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AM')).toBeInTheDocument();
  });

  it('never speaks in scores, rankings or reviews', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    for (const word of [
      /match score/i,
      /\bscores?\b/i,
      /rating/i,
      /review/i,
      /best match/i,
      /stars?\b/i,
    ]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
  });

  it('has one h1 and a sound heading structure', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    expectSoundHeadingStructure();
  });

  it('sets the document title to the therapist name', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(document.title).toContain('Ananya Mehra');
    });
  });

  it('offers a way back, and nothing else to press', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });

    expect(screen.getByRole('link', { name: /back to the beginning/i })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('says it is waiting, without a spinner', async () => {
    stubApi();
    renderRoute(therapistPath(ID));

    expect(screen.getByText('Finding their profile…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ananya Mehra');
    });
  });

  it('distinguishes a missing profile from a broken service', async () => {
    stubApi(() => ({
      status: 404,
      json: { statusCode: 404, error: 'Not Found', message: 'No therapist has that id.' },
    }));
    renderRoute(therapistPath('00000000-0000-0000-0000-000000000000'));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /don’t have anyone at this address/i }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to the beginning/i })).toBeInTheDocument();
  });

  it('explains a service failure in plain words and offers a retry', async () => {
    stubApi(() => ({
      status: 503,
      json: {
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'The therapist store is not available right now.',
      },
    }));
    renderRoute(therapistPath(ID));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('The service answered with an error.')).toBeInTheDocument();
    expect(screen.queryByText(/not available right now/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
