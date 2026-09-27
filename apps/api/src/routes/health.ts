import type { FastifyPluginCallback } from 'fastify';

/** Body returned by `GET /health`. Phase 1 intentionally exposes nothing else. */
export interface HealthResponse {
  readonly status: 'ok';
}

const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', const: 'ok' },
  },
  required: ['status'],
  additionalProperties: false,
} as const;

export const healthRoute: FastifyPluginCallback = (app, _options, done) => {
  app.get(
    '/health',
    {
      schema: {
        summary: 'Liveness probe',
        description: 'Returns a static ok payload. Phase 1 has no other endpoints.',
        response: { 200: healthResponseSchema },
      },
    },
    (): HealthResponse => ({ status: 'ok' }),
  );

  done();
};
