import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no layout engine and no scrolling. React Router's
// <ScrollRestoration /> calls window.scrollTo on every navigation, so stub it
// to keep the test output readable.
window.scrollTo = () => undefined;

// Vitest runs without globals, so Testing Library's automatic cleanup never
// registers itself. Unmount between tests explicitly.
afterEach(() => {
  cleanup();
});
