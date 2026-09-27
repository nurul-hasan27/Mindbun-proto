import Fastify, { type FastifyInstance } from 'fastify';
import type { LogLevel } from './config/env.js';
import { healthRoute } from './routes/health.js';

export interface BuildAppOptions {
  /**
   * `false` keeps Fastify silent, which is what tests want. Pass a level to enable
   * structured request logging in development.
   */
  readonly logger?: false | { readonly level: LogLevel };
}

/** Creates an unstarted Fastify instance with every Phase 1 route registered. */
export function buildApp({ logger = false }: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  app.register(healthRoute);

  return app;
}
