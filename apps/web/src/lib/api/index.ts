export { apiClient, createApiClient } from './client';
export { apiConfig, isDev, type ApiConfig } from './config';
export { ApiError, isApiError, toApiError, type ApiErrorKind } from './errors';
export { fetchHealthStatus } from './health';
export { getTherapist, getTherapists, type TherapistFilters } from './therapists';
export { API_V1 } from './version';
export type { ApiClient, ApiClientOptions, QueryValue, RequestOptions } from './client';
export type {
  AttributeView,
  AvailabilityWindowView,
  DayName,
  HealthStatus,
  TherapistPage,
  TherapistProfile,
  TherapistSummary,
} from './types';
