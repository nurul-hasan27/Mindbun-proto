import { apiConfig } from './config';
import { ApiError } from './errors';

/** The subset of `fetch` this client depends on, so tests can supply their own. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ApiClient {
  request<TResponse>(path: string, options?: RequestOptions): Promise<TResponse>;
  get<TResponse>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<TResponse>;
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Readonly<Record<string, QueryValue>>,
): string {
  const url = `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  if (query === undefined) {
    return url;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }

  const queryString = search.toString();
  return queryString === '' ? url : `${url}?${queryString}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * A very small, typed HTTP client built on the platform `fetch`.
 *
 * It exists to give the app one place that knows about timeouts, JSON,
 * cancellation and failure — so no component ever calls `fetch` directly, and
 * no component ever has to guess what went wrong.
 */
export function createApiClient({ baseUrl, timeoutMs, fetchImpl }: ApiClientOptions): ApiClient {
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  async function request<TResponse>(
    path: string,
    {
      method = 'GET',
      body,
      query,
      signal,
      timeoutMs: requestTimeoutMs = timeoutMs,
      headers = {},
    }: RequestOptions = {},
  ): Promise<TResponse> {
    if (baseUrl === '') {
      throw new ApiError({
        kind: 'config',
        detail: 'VITE_API_URL is not set, so there is no API to talk to.',
      });
    }

    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    const forwardAbort = (): void => controller.abort();
    signal?.addEventListener('abort', forwardAbort);

    try {
      const response = await doFetch(buildUrl(baseUrl, path, query), {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        throw new ApiError({
          kind: 'http',
          status: response.status,
          detail: `The service responded with ${response.status} ${response.statusText}.`,
        });
      }

      if (response.status === 204) {
        return undefined as TResponse;
      }

      try {
        return (await response.json()) as TResponse;
      } catch (cause) {
        throw new ApiError({
          kind: 'parse',
          status: response.status,
          detail: 'The service did not return JSON.',
          cause,
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (timedOut) {
        throw new ApiError({
          kind: 'timeout',
          detail: `No response within ${requestTimeoutMs}ms.`,
          cause: error,
        });
      }

      if (signal?.aborted === true || isAbortError(error)) {
        throw new ApiError({ kind: 'aborted', detail: 'The request was cancelled.', cause: error });
      }

      throw new ApiError({
        kind: 'network',
        detail: error instanceof Error ? error.message : 'The request could not be completed.',
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  return {
    request,
    get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  };
}

/** The client the application uses. Tests build their own with `createApiClient`. */
export const apiClient: ApiClient = createApiClient({
  baseUrl: apiConfig.baseUrl,
  timeoutMs: apiConfig.timeoutMs,
});
