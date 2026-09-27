/**
 * The shapes the API returns.
 *
 * These mirror the JSON Schemas that the backend enforces at runtime
 * (`apps/api/src/api/v1/schemas/*`). The schema is the source of truth; these
 * types are the typed view of it on this side of the wire. If a schema changes,
 * change the matching interface in the same commit.
 */

/** `GET /api/v1/health` */
export interface HealthStatus {
  readonly status: 'ok';
  readonly service: string;
  readonly version: string;
  /** ISO 8601 timestamp of the moment the response was produced. */
  readonly timestamp: string;
}

/** Shape of an unsuccessful API response, when the server sends one. */
export interface ApiErrorPayload {
  readonly statusCode?: number;
  readonly error?: string;
  readonly message?: string;
}
