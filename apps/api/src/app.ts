import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { v1Routes } from './api/v1/routes/index.js';
import type { LogLevel } from './config/env.js';
import { infrastructureHealthRoute } from './routes/health.js';

/** The prefix that namespaces the versioned application API. */
export const API_PREFIX = '/api/v1';

export interface BuildAppOptions {
  /**
   * `false` keeps Fastify silent, which is what tests want. Pass a level to enable
   * structured request logging in development.
   */
  readonly logger?: false | { readonly level: LogLevel };
  /** Browser origins allowed to call the API. */
  readonly corsOrigins?: readonly string[];
}

/**
 * Creates an unstarted Fastify instance with every route registered.
 *
 * Two surfaces, on purpose:
 * - `/health` — infrastructure liveness, no CORS, no version, cheap to poll.
 * - `/api/v1/*` — the application API the frontend talks to.
 */
export function buildApp({
  logger = false,
  corsOrigins = [],
}: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  if (corsOrigins.length > 0) {
    app.register(cors, { origin: [...corsOrigins] });
  }

  app.register(infrastructureHealthRoute);
  app.register(v1Routes, { prefix: API_PREFIX });

  return app;
}
