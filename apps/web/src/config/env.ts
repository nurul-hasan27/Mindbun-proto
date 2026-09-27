/**
 * Typed access to the browser-visible environment.
 *
 * Only variables prefixed with `VITE_` are exposed by Vite, so nothing secret
 * can reach the client bundle through this module.
 */
export interface WebEnv {
  /** Base URL of the API, e.g. `http://127.0.0.1:4000`. */
  readonly apiBaseUrl: string;
}

const defaultApiBaseUrl = 'http://127.0.0.1:4000';

export const env: WebEnv = Object.freeze({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl,
});
