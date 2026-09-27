import { API_V1 } from './version';
import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';
import type { TherapistPage, TherapistProfile } from './types';

export interface TherapistFilters {
  readonly take?: number;
  readonly skip?: number;
  /** ISO 639-1 code, e.g. "hi". */
  readonly language?: string;
  /** An area-of-work key, e.g. "career-transitions". */
  readonly area?: string;
}

type SignalOptions = Omit<RequestOptions, 'method' | 'body' | 'query'>;

/**
 * Cheap structural checks, the same idea as the health check: a proxy that
 * answers 200 with something else entirely should become a calm error, not an
 * undefined property three components away.
 */
function assertPage(value: unknown): TherapistPage {
  const candidate = value as { items?: unknown; pagination?: unknown } | null;

  if (!Array.isArray(candidate?.items) || typeof candidate?.pagination !== 'object') {
    throw new ApiError({
      kind: 'parse',
      detail: 'The therapist list did not have the expected shape.',
    });
  }

  return value as TherapistPage;
}

function assertProfile(value: unknown): TherapistProfile {
  const candidate = value as { displayName?: unknown; languages?: unknown } | null;

  if (typeof candidate?.displayName !== 'string' || !Array.isArray(candidate?.languages)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The therapist profile did not have the expected shape.',
    });
  }

  return value as TherapistProfile;
}

/**
 * `GET /api/v1/therapists`
 *
 * A page of summaries, not full profiles: a list is a way to recognise people,
 * and the detail belongs on the profile.
 */
export async function getTherapists(
  filters: TherapistFilters = {},
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<TherapistPage> {
  const payload = await client.get<unknown>(`${API_V1}/therapists`, {
    ...options,
    query: {
      take: filters.take,
      skip: filters.skip,
      language: filters.language,
      area: filters.area,
    },
  });

  return assertPage(payload);
}

/**
 * `GET /api/v1/therapists/:id`
 *
 * Rejects with an `ApiError` of kind `http` and status 404 when there is no such
 * profile, which is a different situation from the service being unavailable —
 * and the profile page says so in different words.
 */
export async function getTherapist(
  id: string,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<TherapistProfile> {
  const payload = await client.get<unknown>(
    `${API_V1}/therapists/${encodeURIComponent(id)}`,
    options,
  );

  return assertProfile(payload);
}
