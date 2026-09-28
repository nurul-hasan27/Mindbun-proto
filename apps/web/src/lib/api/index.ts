export { apiClient, createApiClient } from './client';
export { apiConfig, isDev, type ApiConfig } from './config';
export { ApiError, isApiError, toApiError, type ApiErrorKind } from './errors';
export { fetchHealthStatus } from './health';
export { fetchIntakeVocabulary, submitIntake } from './intake';
export {
  fetchFeedbackReasons,
  requestRematch,
  requestRematchRecommendation,
  submitFeedback,
} from './feedback';
export { requestMatch, requestRecommendation } from './matches';
export { getTherapist, getTherapists, type TherapistFilters } from './therapists';
export { API_V1 } from './version';
export type { ApiClient, ApiClientOptions, QueryValue, RequestOptions } from './client';
export { isRecommendation } from './types';
export { isRematch } from './types';
export type {
  AttributeView,
  AvailabilityInput,
  AvailabilityWindowView,
  ChangeNote,
  DayName,
  FeedbackReason,
  FeedbackReceipt,
  RematchOutcome,
  RematchRecommendation,
  HealthStatus,
  IntakeDraftPayload,
  IntakeReceipt,
  IntakeVocabulary,
  LanguageView,
  MatchOutcome,
  MatchReason,
  MatchRecommendation,
  MatchedTherapist,
  NoCandidateOutcome,
  TherapistPage,
  TherapistProfile,
  TherapistSummary,
} from './types';
