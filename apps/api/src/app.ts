import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { v1Routes } from './api/v1/routes/index.js';
import type { LogLevel } from './config/env.js';
import { createPrismaTherapistRepository } from './data/therapists/prismaTherapistRepository.js';
import {
  DataStoreUnavailableError,
  type TherapistRepository,
} from './data/therapists/therapistRepository.js';
import { getPrismaClient } from './lib/prisma.js';
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
  /**
   * The store the therapist routes read from. Injected rather than imported so
   * that tests can supply an in-memory repository and never touch a database.
   * When it is omitted the process still starts, liveness still answers, and
   * the therapist routes answer 503.
   */
  readonly therapists?: TherapistRepository;
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
  therapists,
}: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  if (corsOrigins.length > 0) {
    app.register(cors, { origin: [...corsOrigins] });
  }

  app.register(infrastructureHealthRoute);
  app.register(v1Routes, {
    prefix: API_PREFIX,
    therapists: therapists ?? unavailableTherapistRepository(),
  });

  return app;
}

/** The production wiring: Prisma behind the repository port. */
export function buildAppWithStore({
  logger,
  corsOrigins,
}: { logger?: { level: LogLevel }; corsOrigins?: readonly string[] } = {}): FastifyInstance {
  return buildApp({
    logger,
    corsOrigins,
    therapists: createPrismaTherapistRepository(getPrismaClient()),
  });
}

/**
 * Stands in when there is no store — the process is running without
 * `DATABASE_URL`, or a test has not supplied one.
 */
function unavailableTherapistRepository(): TherapistRepository {
  const unavailable = (): never => {
    throw new DataStoreUnavailableError('The therapist store is not available.');
  };

  return {
    list: unavailable,
    findById: unavailable,
    hasLanguage: unavailable,
    hasArea: unavailable,
  };
}
