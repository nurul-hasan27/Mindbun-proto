import { apiClient, fetchHealthStatus } from '../lib/api';
import { useApiResource } from '../lib/useApiResource';
import { LoadingNote } from './LoadingNote';
import { QuietButton } from './QuietButton';

/**
 * Development-only proof that the whole path works: client → HTTP → CORS →
 * Fastify → `/api/v1`.
 *
 * It is a footnote in the footer, and the footer only renders it in a
 * development build. This is an engineering instrument, not a product feature:
 * no visitor should ever be shown a connection badge.
 */
export function DevStatus() {
  const { state, retry } = useApiResource((signal) => fetchHealthStatus(apiClient, { signal }), []);

  if (state.status === 'loading') {
    return <LoadingNote className="text-micro">Checking the API…</LoadingNote>;
  }

  if (state.status === 'error') {
    return (
      <p className="text-micro text-ink-faint flex items-center gap-2">
        <span>API unreachable ({state.error.kind})</span>
        <QuietButton className="text-micro" onClick={retry}>
          Retry
        </QuietButton>
      </p>
    );
  }

  return (
    <p className="text-micro text-ink-faint">
      Dev only · API {state.data.status} · v{state.data.version}
    </p>
  );
}
