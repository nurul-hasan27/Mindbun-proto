import { API_V1 } from './version';
import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';
import type {
  FeedbackReason,
  FeedbackReceipt,
  RematchOutcome,
  RematchRecommendation,
} from './types';

type SignalOptions = Omit<RequestOptions, 'method' | 'body' | 'query'>;

/**
 * `GET /api/v1/feedback/reasons`
 *
 * The terms on offer, read from the database rather than written into this file.
 *
 * The `key` is what the engine matches on and the wording is what a person reads, and
 * the two are allowed to diverge — that is the point of fetching rather than hardcoding.
 * A client with the words baked in would need a code change to change a sentence, and
 * would be free to drift from the vocabulary the server actually has.
 */
export async function fetchFeedbackReasons(
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<readonly FeedbackReason[]> {
  const payload = await client.get<unknown>(`${API_V1}/feedback/reasons`, options);

  if (!isReasonList(payload)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The reasons did not have the expected shape.',
    });
  }

  return payload.reasons;
}

/**
 * `POST /api/v1/matches/:matchId/feedback`
 *
 * Takes the reasons, and optionally a note. It takes nothing else: there is no field
 * here for naming a client, naming a therapist, or asking for a specific person, and
 * that is the whole of the guarantee — those are worked out on the server from the
 * match. A `400` in practice means a reason we do not offer, which is a bug in the
 * client rather than a mistake by the person, and the sentence says which.
 *
 * A retry is safe. Declining the same recommendation twice is one row, not two
 * opinions, so a double click cannot become a stronger complaint.
 */
export async function submitFeedback(
  matchId: string,
  request: { readonly reasons: readonly string[]; readonly rawText?: string },
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<FeedbackReceipt> {
  const receipt = await client.request<unknown>(
    `${API_V1}/matches/${encodeURIComponent(matchId)}/feedback`,
    {
      ...options,
      method: 'POST',
      body: {
        reasons: [...request.reasons],
        ...(request.rawText === undefined ? {} : { rawText: request.rawText }),
      },
    },
  );

  if (!isReceipt(receipt)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The response to what you told us did not have the expected shape.',
    });
  }

  return receipt;
}

/**
 * `POST /api/v1/matches/:matchId/rematch`
 *
 * Takes nothing at all — not even an empty object. There is no JSON for the browser to
 * send, so none is sent, and the `content-type` is left off for the same reason: a
 * `POST` that declares JSON and then has no body is a malformed request by anyone's
 * reading.
 *
 * The response is a new person, their reasons, and — when there is one that is real —
 * what is demonstrably different about them.
 */
export async function requestRematch(
  matchId: string,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<RematchOutcome> {
  const outcome = await client.request<unknown>(
    `${API_V1}/matches/${encodeURIComponent(matchId)}/rematch`,
    { ...options, method: 'POST' },
  );

  if (!isRematchOutcome(outcome)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The response to looking again did not have the expected shape.',
    });
  }

  return outcome;
}

/** The new recommendation alone, for a caller that has handled "nobody left". */
export async function requestRematchRecommendation(
  matchId: string,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<RematchRecommendation | null> {
  const outcome = await requestRematch(matchId, client, options);

  return 'therapist' in outcome ? outcome : null;
}

// ---------------------------------------------------------------------------
// Shape checks
//
// Not about correctness — the server validates its own responses. They are about a
// version skew between two independently deployed halves of a prototype not producing
// a page that renders `undefined` in the middle of a sentence.
// ---------------------------------------------------------------------------

function isReasonList(value: unknown): value is { reasons: readonly FeedbackReason[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const reasons = (value as { reasons?: unknown }).reasons;

  return (
    Array.isArray(reasons) &&
    reasons.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as FeedbackReason).key === 'string' &&
        typeof (entry as FeedbackReason).name === 'string',
    )
  );
}

function isReceipt(value: unknown): value is FeedbackReceipt {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const receipt = value as Record<string, unknown>;

  return (
    typeof receipt['feedbackId'] === 'string' &&
    typeof receipt['matchId'] === 'string' &&
    Array.isArray(receipt['reasons'])
  );
}

function isRematchOutcome(value: unknown): value is RematchOutcome {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const outcome = value as Record<string, unknown>;

  if (outcome['outcome'] === 'no_candidate') {
    return typeof outcome['considered'] === 'number';
  }

  return (
    typeof outcome['matchId'] === 'string' &&
    typeof outcome['attempt'] === 'number' &&
    typeof outcome['previousTherapistName'] === 'string' &&
    isTherapist(outcome['therapist']) &&
    Array.isArray(outcome['whyThisMatch']) &&
    outcome['whyThisMatch'].every(isReason) &&
    Array.isArray(outcome['whatChanged']) &&
    outcome['whatChanged'].every(isChangeNote) &&
    Array.isArray(outcome['adjustedFor'])
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

function isChangeNote(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const note = value as Record<string, unknown>;

  return (
    typeof note['category'] === 'string' &&
    typeof note['sentence'] === 'string' &&
    typeof note['detail'] === 'string'
  );
}
