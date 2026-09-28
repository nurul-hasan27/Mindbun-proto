import { API_V1 } from './version';
import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';
import type {
  AvailabilityInput,
  AttributeView,
  IntakeDraftPayload,
  IntakeReceipt,
  IntakeVocabulary,
  LanguageView,
} from './types';

type SignalOptions = Omit<RequestOptions, 'method' | 'body' | 'query'>;

/**
 * `GET /api/v1/intake/vocabulary`
 *
 * Everything the questions may be about, read from the database rather than
 * hardcoded: a keyword this client sends is then a keyword the server has
 * actually heard of.
 */
export async function fetchIntakeVocabulary(
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<IntakeVocabulary> {
  const payload = await client.get<unknown>(`${API_V1}/intake/vocabulary`, options);

  if (!isVocabulary(payload)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The intake vocabulary did not have the expected shape.',
    });
  }

  return payload;
}

/**
 * `POST /api/v1/intakes`
 *
 * Safe to retry: the payload carries a `submissionId` that is stable for a
 * given draft, so sending it twice stores one intake rather than two. Nothing
 * about a retry is communicated back to the person — a successful retry simply
 * succeeds again.
 */
export async function submitIntake(
  payload: IntakeDraftPayload,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<IntakeReceipt> {
  const body = await client.request<unknown>(`${API_V1}/intakes`, {
    ...options,
    method: 'POST',
    body: payload,
  });

  if (!isReceipt(body)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The intake receipt did not have the expected shape.',
    });
  }

  return body;
}

function isAttribute(value: unknown): value is AttributeView {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AttributeView).key === 'string' &&
    typeof (value as AttributeView).name === 'string'
  );
}

function isAttributeList(value: unknown): value is readonly AttributeView[] {
  return Array.isArray(value) && value.every(isAttribute);
}

function isLanguageList(value: unknown): value is readonly LanguageView[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as LanguageView).code === 'string' &&
        typeof (entry as LanguageView).name === 'string',
    )
  );
}

function isVocabulary(value: unknown): value is IntakeVocabulary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<IntakeVocabulary>;

  return (
    isAttributeList(candidate.areasOfWork) &&
    isAttributeList(candidate.communicationStyles) &&
    isAttributeList(candidate.contextualExperience) &&
    isAttributeList(candidate.sessionFormats) &&
    isLanguageList(candidate.languages)
  );
}

function isReceipt(value: unknown): value is IntakeReceipt {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IntakeReceipt).intakeId === 'string' &&
    typeof (value as IntakeReceipt).receivedAt === 'string'
  );
}

export type { AvailabilityInput };
