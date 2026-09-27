import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';
import type { HealthStatus } from './types';
import { API_V1 } from './version';

/**
 * Checks that a payload really is a health response before handing it to the
 * UI. A cheap structural check instead of a validation library: enough to turn
 * a misconfigured proxy into a calm error rather than a broken screen.
 */
function assertHealthStatus(value: unknown): HealthStatus {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { status?: unknown }).status !== 'ok' ||
    typeof (value as { service?: unknown }).service !== 'string'
  ) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The health response did not have the expected shape.',
    });
  }

  return value as HealthStatus;
}

/** `GET /api/v1/health` */
export async function fetchHealthStatus(
  client: ApiClient = apiClient,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
): Promise<HealthStatus> {
  const payload = await client.get<unknown>(`${API_V1}/health`, options);
  return assertHealthStatus(payload);
}
