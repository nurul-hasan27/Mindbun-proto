import type { FastifyPluginCallback, FastifyPluginOptions } from 'fastify';
import type { IntakeRepository } from '../../../data/intake/intakeRepository.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { v1HealthRoute } from './health.js';
import { buildIntakeRoutes } from './intake.js';
import { buildMatchRoutes } from './matches.js';
import { buildTherapistRoutes } from './therapists.js';

export interface V1RouteOptions {
  readonly therapists: TherapistRepository;
  readonly intakes: IntakeRepository;
  readonly matches: MatchRepository;
}

/**
 * Everything under `/api/v1`.
 *
 * Repositories are handed in rather than imported, so the composition root in
 * `app.ts` is the only place that knows which implementation is in use. Future
 * domains (recommendation, feedback) register here as siblings, and a future
 * `/api/v2` can sit beside this without touching it.
 */
export const v1Routes: FastifyPluginCallback<FastifyPluginOptions & V1RouteOptions> = (
  app,
  options,
  done,
) => {
  app.register(v1HealthRoute);
  app.register(buildTherapistRoutes(options.therapists));
  app.register(buildIntakeRoutes(options.intakes));
  // Matching needs both stores: the intake to match and the therapists to match
  // against. It is the first route that does, which is why it is also the first to
  // make dependency injection obvious.
  app.register(buildMatchRoutes(options.matches, options.therapists));

  done();
};
