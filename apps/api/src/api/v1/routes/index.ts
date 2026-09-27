import type { FastifyPluginCallback } from 'fastify';
import { v1HealthRoute } from './health.js';

/**
 * Everything under `/api/v1`.
 *
 * Future domains (intake, matching, recommendations, feedback) register here as
 * sibling plugins, so the versioned surface stays in one obvious place and a
 * future `/api/v2` can be added beside it without touching v1.
 */
export const v1Routes: FastifyPluginCallback = (app, _options, done) => {
  app.register(v1HealthRoute);

  done();
};
