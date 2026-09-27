/**
 * The `/api/v1/health` contract.
 *
 * This JSON Schema is the source of truth for the response: Fastify validates
 * outgoing payloads against it, and the web client mirrors the shape in
 * `apps/web/src/lib/api/types.ts`. Change both together.
 */
export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'why-this-match-api';
  readonly version: string;
  readonly timestamp: string;
}

export const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', const: 'ok' },
    service: { type: 'string', const: 'why-this-match-api' },
    version: { type: 'string' },
    timestamp: { type: 'string' },
  },
  required: ['status', 'service', 'version', 'timestamp'],
  additionalProperties: false,
} as const;

/** Kept in one place so the reported version cannot drift from the package. */
export const serviceVersion = '0.3.0';
