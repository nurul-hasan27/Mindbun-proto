import { useCallback, useEffect, useState } from 'react';
import { toApiError, type ApiError } from './api/errors';

export type ResourceState<TData> =
  | { readonly status: 'loading'; readonly data: null; readonly error: null }
  | { readonly status: 'ready'; readonly data: TData; readonly error: null }
  | { readonly status: 'error'; readonly data: null; readonly error: ApiError };

export interface ApiResource<TData> {
  readonly state: ResourceState<TData>;
  /** Runs the loader again. Safe to call from an error state's recovery action. */
  readonly retry: () => void;
}

/**
 * The outcome of one attempt. Tagging it with the attempt number is what makes a
 * late reply from a superseded request impossible to mistake for the current one.
 */
type Outcome<TData> =
  | { readonly attempt: number; readonly ok: true; readonly data: TData }
  | { readonly attempt: number; readonly ok: false; readonly error: ApiError };

const LOADING = { status: 'loading', data: null, error: null } as const;

/**
 * The one place asynchronous data becomes a state the UI can render.
 *
 * - "loading" is derived, not set: there is no `setState` inside the effect body,
 *   so starting a request never causes a cascading render
 * - each run gets its own `AbortSignal`, so leaving a view cancels its request
 * - a superseded run can never overwrite a newer one, because its attempt number
 *   will not match
 * - failures always arrive as an `ApiError`, never as `unknown`
 * - nothing is cached globally: remounting re-fetches, which is honest for a
 *   prototype with no server-side session
 */
export function useApiResource<TData>(
  load: (signal: AbortSignal) => Promise<TData>,
  deps: readonly unknown[],
): ApiResource<TData> {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome<TData> | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal).then(
      (data) => {
        setOutcome({ attempt, ok: true, data });
      },
      (reason: unknown) => {
        const error = toApiError(reason);

        if (error.kind === 'aborted') {
          return;
        }

        console.error('[api]', error.kind, error.detail);
        setOutcome({ attempt, ok: false, error });
      },
    );

    return () => {
      controller.abort();
    };
    // The caller owns the dependency list, exactly like `useEffect`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const state: ResourceState<TData> = (() => {
    if (outcome?.attempt !== attempt) {
      return LOADING;
    }

    return outcome.ok
      ? { status: 'ready', data: outcome.data, error: null }
      : { status: 'error', data: null, error: outcome.error };
  })();

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
