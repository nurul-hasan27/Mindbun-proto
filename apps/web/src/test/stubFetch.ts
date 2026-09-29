import type { FetchLike } from '../lib/api/client';

export interface StubResponseInit {
  readonly status?: number;
  readonly statusText?: string;
  readonly json?: unknown;
  /** Raw body, for testing a response that is not valid JSON. */
  readonly text?: string;
}

export type StubHandler = (
  url: string,
  init: RequestInit,
) => StubResponseInit | Promise<StubResponseInit>;

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

function bodyOf(result: StubResponseInit): string | null {
  if (result.text !== undefined) {
    return result.text;
  }

  if (result.json === undefined) {
    return null;
  }

  return JSON.stringify(result.json);
}

/**
 * A minimal `fetch` stand-in, so no test needs a running backend.
 *
 * It honours `init.signal` the way the real thing does, which is what lets the
 * timeout and cancellation paths be tested honestly.
 */
export function stubFetch(handler: StubHandler): {
  fetchImpl: FetchLike;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });

    const signal = init.signal ?? null;
    const pending = handler(url, init);
    const result =
      signal === null ? await pending : await Promise.race([pending, rejectOnAbort(signal)]);

    return new Response(bodyOf(result), {
      status: result.status ?? 200,
      statusText: result.statusText ?? 'OK',
      headers: { 'content-type': 'application/json' },
    });
  };

  return { fetchImpl, calls };
}

/** A handler that never settles, for testing timeouts. */
export const neverSettles: StubHandler = () => new Promise<never>(() => undefined);
