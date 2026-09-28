import { API_V1 } from './version';
import { apiClient, type ApiClient } from './client';
import { ApiError } from './errors';
import { isRecommendation, type MatchOutcome, type MatchRecommendation } from './types';

interface SignalOptions {
  readonly signal?: AbortSignal;
}

/**
 * `POST /api/v1/matches`
 *
 * Takes one identifier — the intake — and nothing else. There is deliberately no
 * way to name a therapist, because a client that could ask "does this one match?"
 * would be a client deciding the answer, and the whole point is that the decision
 * is worked out on the server from what someone actually said.
 *
 * Safe to call repeatedly: the server evaluates an intake once and returns the same
 * stored decision. A retry after a dropped connection is therefore a no-op rather
 * than a second search, and the caller does not have to think about it.
 */
export async function requestMatch(
  intakeId: string,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<MatchOutcome> {
  const outcome = await client.request<unknown>(`${API_V1}/matches`, {
    ...options,
    method: 'POST',
    body: { intakeId },
  });

  if (!isOutcome(outcome)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The matching service answered with something we cannot read.',
    });
  }

  return outcome;
}

/** The recommendation alone, for a caller that has already handled "no candidate". */
export async function requestRecommendation(
  intakeId: string,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<MatchRecommendation | null> {
  const outcome = await requestMatch(intakeId, client, options);

  return isRecommendation(outcome) ? outcome : null;
}

/**
 * A shape check rather than a schema.
 *
 * The server already validates its own responses, so this is not about
 * correctness — it is about a version skew between two independently deployed
 * halves of a prototype not producing a page that renders `undefined` in the
 * middle of a sentence.
 */
function isOutcome(value: unknown): value is MatchOutcome {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate['outcome'] === 'no_candidate') {
    return typeof candidate['considered'] === 'number';
  }

  return (
    typeof candidate['matchId'] === 'string' &&
    typeof candidate['decidedAt'] === 'string' &&
    isTherapist(candidate['therapist']) &&
    Array.isArray(candidate['whyThisMatch']) &&
    candidate['whyThisMatch'].every(isReason)
  );
}

function isTherapist(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const therapist = value as Record<string, unknown>;

  return (
    typeof therapist['displayName'] === 'string' &&
    typeof therapist['headline'] === 'string' &&
    typeof therapist['bio'] === 'string' &&
    Array.isArray(therapist['languages']) &&
    Array.isArray(therapist['areasOfWork'])
  );
}

function isReason(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const reason = value as Record<string, unknown>;

  return (
    typeof reason['key'] === 'string' &&
    typeof reason['sentence'] === 'string' &&
    typeof reason['detail'] === 'string'
  );
}
