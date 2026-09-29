/**
 * One error type for every way a request can fail, so the UI never has to
 * inspect `unknown` and never has to show a raw network message.
 */
export type ApiErrorKind =
  /** The request never reached the server (offline, wrong port, DNS, CORS). */
  | 'network'
  /** The request took longer than the configured timeout. */
  | 'timeout'
  /** The caller aborted the request, usually because the view went away. */
  | 'aborted'
  /** The server answered, but not with a success status. */
  | 'http'
  /** The server answered with something that is not the JSON we expected. */
  | 'parse'
  /** The app has no usable API URL configured. */
  | 'config';

export interface ApiErrorDetails {
  readonly kind: ApiErrorKind;
  /** HTTP status when there was a response; `null` when the request never landed. */
  readonly status?: number | null;
  /** Only for logging and the collapsible technical detail. */
  readonly detail: string;
  readonly cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly detail: string;
  override readonly cause: unknown;

  constructor({ kind, status = null, detail, cause }: ApiErrorDetails) {
    super(detail);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
    this.cause = cause;
  }

  /** Errors that are worth offering a "try again" action for. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'http';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Last line of defence: anything thrown by a loader becomes an `ApiError`. */
export function toApiError(value: unknown): ApiError {
  if (isApiError(value)) {
    return value;
  }

  if (value instanceof Error) {
    return new ApiError({ kind: 'network', detail: value.message, cause: value });
  }

  return new ApiError({ kind: 'network', detail: 'An unknown error occurred.', cause: value });
}
