/**
 * Typed access to build-time configuration.
 *
 * Components never read `import.meta.env` and never hardcode a host. If a
 * setting is needed, add it here with a documented default.
 */

const DEFAULT_DEV_API_URL = 'http://127.0.0.1:4000';
const DEFAULT_API_TIMEOUT_MS = 8_000;

export interface ApiConfig {
  /** Origin of the API, exactly as configured. The client normalises slashes. */
  readonly baseUrl: string;
  /** How long a single request may take before it is abandoned. */
  readonly timeoutMs: number;
}

function readString(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/** Exported for tests: a misconfigured timeout must never take the app down. */
export function readTimeout(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    // A misconfigured timeout should not take the app down; fall back loudly
    // enough to notice in the console, but keep the product usable.
    console.warn(
      `[config] VITE_API_TIMEOUT_MS="${value}" is not a positive number. Using ${fallback}.`,
    );
    return fallback;
  }

  return parsed;
}

function readBaseUrl(): string {
  // In development, assume the API is running on its default port. In a built
  // app there is no such assumption: an unset variable resolves to the origin
  // the app was served from, which is the only sensible default.
  return readString(import.meta.env.VITE_API_URL, import.meta.env.DEV ? DEFAULT_DEV_API_URL : '');
}

export const apiConfig: ApiConfig = {
  baseUrl: readBaseUrl(),
  timeoutMs: readTimeout(import.meta.env.VITE_API_TIMEOUT_MS, DEFAULT_API_TIMEOUT_MS),
};

export const isDev = import.meta.env.DEV;
