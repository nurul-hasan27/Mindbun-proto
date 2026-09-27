import type { FastifyPluginCallback } from 'fastify';

/**
 * `GET /health` — infrastructure liveness.
 *
 * Deliberately minimal and version-free: load balancers and uptime checks should
 * not depend on the shape of the application API. The client uses
 * `GET /api/v1/health` instead.
 */
export interface InfrastructureHealthResponse {
  readonly status: 'ok';
}

const infrastructureHealthSchema = {
  type: 'object',
  properties: { status: { type: 'string', const: 'ok' } },
  required: ['status'],
  additionalProperties: false,
} as const;

export const infrastructureHealthRoute: FastifyPluginCallback = (app, _options, done) => {
  app.get(
    '/health',
    {
      schema: {
        summary: 'Liveness probe',
        description: 'Returns a static ok payload for infrastructure health checks.',
        response: { 200: infrastructureHealthSchema },
      },
    },
    (): InfrastructureHealthResponse => ({ status: 'ok' }),
  );

  done();
};
