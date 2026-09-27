import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';

/**
 * The frame every route shares. Deliberately thin: a name, one link, the page,
 * and a footnote. The client should feel they have entered a quiet space, not
 * opened a dashboard.
 */
export function SiteLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="grain-layer" aria-hidden="true" />

      <SiteHeader />

      {/* Keyed on the pathname so each route plays the short entrance once. */}
      <main id="main-content" key={pathname} className="route-enter flex-1">
        <Outlet />
      </main>

      <SiteFooter />

      <ScrollRestoration />
    </div>
  );
}
