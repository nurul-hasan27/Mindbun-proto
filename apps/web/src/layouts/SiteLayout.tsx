import { Outlet, ScrollRestoration } from 'react-router';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { useRouteEntrance } from '../lib/useRouteEntrance';

/**
 * The frame every route shares. Deliberately thin: a name, the page, and a
 * footnote. The person should feel they have entered a quiet space, not opened a
 * dashboard.
 *
 * The entrance animation is played by `useRouteEntrance` on this element rather
 * than by re-keying it, so navigating between routes never destroys page state.
 */
export function SiteLayout() {
  const mainRef = useRouteEntrance<HTMLElement>();

  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="grain-layer" aria-hidden="true" />

      <SiteHeader />

      <main id="main-content" ref={mainRef} className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />

      {/* Going back returns you to where you were reading, not to the top. */}
      <ScrollRestoration />
    </div>
  );
}
