export { apiClient, createApiClient } from './client';
export { apiConfig, isDev, type ApiConfig } from './config';
export { ApiError, isApiError, toApiError, type ApiErrorKind } from './errors';
export { fetchHealthStatus } from './health';
export { fetchIntakeVocabulary, submitIntake } from './intake';
export { getTherapist, getTherapists, type TherapistFilters } from './therapists';
export { API_V1 } from './version';
export type { ApiClient, ApiClientOptions, QueryValue, RequestOptions } from './client';
export type {
  AttributeView,
  AvailabilityInput,
  AvailabilityWindowView,
  DayName,
  HealthStatus,
  IntakeDraftPayload,
  IntakeReceipt,
  IntakeVocabulary,
  LanguageView,
  TherapistPage,
  TherapistProfile,
  TherapistSummary,
} from './types';
