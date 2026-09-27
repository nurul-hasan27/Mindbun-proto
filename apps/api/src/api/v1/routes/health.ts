import type { FastifyPluginCallback } from 'fastify';
import { healthResponseSchema, serviceVersion, type HealthResponse } from '../schemas/health.js';

/**
 * `GET /api/v1/health`
 *
 * The application-facing status endpoint. It exists so the client (and later
 * phases) can prove the whole path works: frontend → API client → HTTP → CORS
 * → Fastify → `/api/v1`. It reports no user data and asks for no input.
 */
export const v1HealthRoute: FastifyPluginCallback = (app, _options, done) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Application API status',
        description: 'Returns service identity and liveness for the versioned application API.',
        response: { 200: healthResponseSchema },
      },
    },
    (): HealthResponse => ({
      status: 'ok',
      service: 'why-this-match-api',
      version: serviceVersion,
      timestamp: new Date().toISOString(),
    }),
  );

  done();
};
