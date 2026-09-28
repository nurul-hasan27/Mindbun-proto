import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApiResource } from './useApiResource';
import { ApiError } from './api/errors';

const pending = <T>(): Promise<T> => new Promise<T>(() => undefined);

describe('useApiResource', () => {
  it('starts in a loading state and resolves to ready', async () => {
    const { result } = renderHook(() => useApiResource(() => Promise.resolve('value'), []));

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', data: 'value', error: null });
    });
  });

  it('turns a failure into an ApiError, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() =>
      useApiResource(
        () => Promise.reject(new ApiError({ kind: 'http', status: 500, detail: 'boom' })),
        [],
      ),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    const state = result.current.state;
    if (state.status !== 'error') {
      throw new Error('expected the error state');
    }
    expect(state.error.kind).toBe('http');
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it('re-runs the loader when retry is called', async () => {
    let calls = 0;
    const { result } = renderHook(() =>
      useApiResource(() => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error('first attempt fails'))
          : Promise.resolve(calls);
      }, []),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', data: 2, error: null });
    });
  });

  it('re-runs the loader when a dependency changes', async () => {
    let calls = 0;
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useApiResource(() => {
          calls += 1;
          return Promise.resolve(id);
        }, [id]),
      { initialProps: { id: 1 } },
    );

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', data: 1, error: null });
    });

    rerender({ id: 2 });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', data: 2, error: null });
    });
    expect(calls).toBe(2);
  });

  it('aborts the in-flight request when the view goes away', () => {
    const seen: AbortSignal[] = [];
    const { unmount } = renderHook(() =>
      useApiResource((signal) => {
        seen.push(signal);
        return pending<string>();
      }, []),
    );

    unmount();

    expect(seen[0]?.aborted).toBe(true);
  });

  it('does not surface an aborted request as an error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() =>
      useApiResource(
        (signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new ApiError({ kind: 'aborted', detail: 'cancelled' })),
            );
          }),
        [],
      ),
    );

    unmount();
    await Promise.resolve();

    expect(result.current.state.status).toBe('loading');
    expect(logged).not.toHaveBeenCalled();

    logged.mockRestore();
  });
});
