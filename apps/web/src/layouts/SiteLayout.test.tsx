import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paths } from '../routes/paths';
import { renderRoute } from '../test/renderRoute';
import { stubIntakeApi } from '../test/intakeRender';

const ALL_ROUTES = [
  paths.home,
  paths.start,
  paths.intake,
  `${paths.intake}/language`,
  `${paths.intake}/review`,
  paths.matching,
  paths.recommendation,
  paths.feedback,
  paths.rematch,
] as const;

interface AnimationStub {
  readonly animate: ReturnType<typeof vi.fn>;
  restore: () => void;
}

/**
 * jsdom implements neither `matchMedia` nor the Web Animations API, so the
 * shell's guards have to be provided before its behaviour can be observed.
 *
 * Descriptors are captured rather than function references, so restoring is
 * exact and no method is ever detached from its object.
 */
function installBrowserStubs({ reducedMotion = false } = {}): AnimationStub {
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') && reducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  const animate = vi.fn(() => ({ cancel: vi.fn(), finish: vi.fn(), play: vi.fn() }));
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });

  const restoreProperty = (
    holder: object,
    key: string,
    descriptor: PropertyDescriptor | undefined,
  ): void => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(holder, key);
      return;
    }
    Object.defineProperty(holder, key, descriptor);
  };

  return {
    animate,
    restore: () => {
      restoreProperty(window, 'matchMedia', originalMatchMedia);
      restoreProperty(Element.prototype, 'animate', originalAnimate);
    },
  };
}

describe('application shell', () => {
  let stubs: AnimationStub;

  beforeEach(() => {
    stubs = installBrowserStubs();
  });

  afterEach(() => {
    stubs.restore();
    vi.unstubAllGlobals();
  });

  it('keeps the same main element across a navigation, so page state is never thrown away', async () => {
    const { router } = renderRoute(paths.home);
    const mainBefore = document.getElementById('main-content');

    expect(mainBefore).not.toBeNull();

    await router.navigate(paths.start);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /start with what you’re looking for/i,
      );
    });

    // Same DOM node: the layout was never remounted, so any state a page holds
    // would have survived.
    expect(document.getElementById('main-content')).toBe(mainBefore);
  });

  it('plays the entrance on each route change, including the first one', async () => {
    const { router } = renderRoute(paths.home);

    expect(stubs.animate).toHaveBeenCalledTimes(1);

    await router.navigate(paths.start);

    await waitFor(() => {
      expect(stubs.animate).toHaveBeenCalledTimes(2);
    });
  });

  it('skips the entrance entirely when reduced motion is requested', async () => {
    stubs.restore();
    stubs = installBrowserStubs({ reducedMotion: true });

    const { router } = renderRoute(paths.home);
    expect(stubs.animate).not.toHaveBeenCalled();

    await router.navigate(paths.start);

    expect(stubs.animate).not.toHaveBeenCalled();
  });

  it('offers a skip link that targets the main landmark', () => {
    renderRoute(paths.home);

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  beforeEach(() => {
    // The intake cannot render its questions without the service's vocabulary.
    stubIntakeApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves from the landing page into the journey without a reload', async () => {
    renderRoute(paths.home);

    fireEvent.click(screen.getByRole('link', { name: /begin gently/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /start with what you’re looking for/i,
      );
    });
  });

  it('supports the browser back button', async () => {
    const { router } = renderRoute(paths.home);

    fireEvent.click(screen.getByRole('link', { name: /begin gently/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.start);
    });

    await router.navigate(-1);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.home);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /a calmer way to find your therapist/i,
      );
    });
  });

  it('supports forward navigation', async () => {
    const { router } = renderRoute(paths.home);

    await router.navigate(paths.start);
    await router.navigate(-1);
    await router.navigate(1);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.start);
    });
  });

  it('walks the journey back one step at a time', async () => {
    const { router } = renderRoute(paths.rematch);

    fireEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.feedback);
    });
  });

  it('deep links directly into any journey step', async () => {
    const steps = [
      paths.start,
      paths.intake,
      paths.matching,
      paths.recommendation,
      paths.feedback,
      paths.rematch,
    ];

    for (const path of steps) {
      const { router, unmount } = renderRoute(path);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(path);
      });
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      unmount();
    }
  });

  it('keeps unknown addresses on the 404 route rather than the home page', () => {
    const { router } = renderRoute('/not-a-real-page');

    expect(router.state.location.pathname).toBe('/not-a-real-page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/this page isn’t here/i);
  });
});

describe('route accessibility', () => {
  beforeEach(() => {
    stubIntakeApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives every route exactly one h1, a title, and a header', async () => {
    for (const path of ALL_ROUTES) {
      const { unmount } = renderRoute(path);

      await waitFor(() => {
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      });
      expect(document.title).not.toBe('');
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();

      unmount();
    }
  });

  it('shows the journey position on journey routes and a way onward elsewhere', () => {
    const landing = renderRoute(paths.home);
    expect(screen.getByRole('link', { name: 'Start' })).toBeInTheDocument();
    landing.unmount();

    renderRoute(paths.matching);
    expect(screen.queryByRole('link', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByText('Step 3 of 6: Finding a fit')).toBeInTheDocument();
  });
});
