import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { v1Routes } from './api/v1/routes/index.js';
import type { LogLevel } from './config/env.js';
import type { IntakeRepository } from './data/intake/intakeRepository.js';
import { createPrismaIntakeRepository } from './data/intake/prismaIntakeRepository.js';
import type { FeedbackRepository } from './data/matching/feedbackRepository.js';
import { createUnavailableFeedbackRepository } from './data/matching/feedbackRepository.js';
import { createPrismaFeedbackRepository } from './data/matching/prismaFeedbackRepository.js';
import type { MatchRepository } from './data/matching/matchRepository.js';
import { createPrismaMatchRepository } from './data/matching/prismaMatchRepository.js';
import { createPrismaTherapistRepository } from './data/therapists/prismaTherapistRepository.js';
import type { TherapistRepository } from './data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from './data/storeErrors.js';
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
   * The stores the routes read from and write to. Injected rather than imported
   * so that tests can supply in-memory repositories and never touch a database.
   * When one is omitted the process still starts, liveness still answers, and
   * the affected routes report 503.
   */
  readonly therapists?: TherapistRepository;
  readonly intakes?: IntakeRepository;
  readonly matches?: MatchRepository;
  readonly feedback?: FeedbackRepository;
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
  intakes,
  matches,
  feedback,
}: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger,
    // Fastify's default validator *strips* properties a schema marks as
    // additional, rather than rejecting the request. That means a declared
    // `additionalProperties: false` would quietly discard something a caller sent
    // and then answer as if it had not been sent — which for this API would mean a
    // caller naming a therapist and getting a match for someone else with no warning
    // at all. Rejecting instead makes every declared schema mean what it says.
    ajv: { customOptions: { removeAdditional: false } },
  });

  // One error shape for the whole application API, including the two failures
  // that would otherwise answer in Fastify's own words: a body that is not JSON,
  // and a body that does not match a schema. The request is still logged, so
  // nothing is lost for whoever is debugging.
  app.setErrorHandler((error: unknown, request, reply) => {
    // `error.statusCode` rather than `reply.statusCode`: a body that fails to
    // parse arrives here before the reply has been given a status, and reading
    // the wrong one turns a 400 into a 500.
    // Fastify's own errors carry a status and a code; a thrown one may have
    // neither, which is why both are read defensively rather than assumed.
    const fastifyError = error as Partial<FastifyError>;
    const status = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
    const code = typeof fastifyError.code === 'string' ? fastifyError.code : undefined;

    if (status >= 400 && status < 500) {
      request.log.warn({ err: error }, 'request rejected');
      void reply.status(status).send({
        statusCode: status,
        error: status === 404 ? 'Not Found' : 'Bad Request',
        message:
          code === 'FST_ERR_CTP_INVALID_JSON_BODY'
            ? 'The request was not readable as JSON.'
            : error instanceof Error
              ? error.message
              : 'The request could not be understood.',
      });
      return;
    }

    request.log.error({ err: error }, 'request failed');
    void reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong.',
    });
  });

  if (corsOrigins.length > 0) {
    app.register(cors, { origin: [...corsOrigins] });
  }

  app.register(infrastructureHealthRoute);
  app.register(v1Routes, {
    prefix: API_PREFIX,
    therapists: therapists ?? unavailableTherapistRepository(),
    intakes: intakes ?? unavailableIntakeRepository(),
    matches: matches ?? unavailableMatchRepository(),
    feedback: feedback ?? createUnavailableFeedbackRepository(),
  });

  return app;
}

/** The production wiring: Prisma behind both repository ports. */
export function buildAppWithStore({
  logger,
  corsOrigins,
}: { logger?: { level: LogLevel }; corsOrigins?: readonly string[] } = {}): FastifyInstance {
  const prisma = getPrismaClient();

  return buildApp({
    logger,
    corsOrigins,
    therapists: createPrismaTherapistRepository(prisma),
    intakes: createPrismaIntakeRepository(prisma),
    matches: createPrismaMatchRepository(prisma),
    feedback: createPrismaFeedbackRepository(prisma),
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

function unavailableIntakeRepository(): IntakeRepository {
  const unavailable = (): never => {
    throw new DataStoreUnavailableError('The intake store is not available.');
  };

  return { readVocabulary: unavailable, submit: unavailable };
}

function unavailableMatchRepository(): MatchRepository {
  const unavailable = (): never => {
    throw new DataStoreUnavailableError('The match store is not available.');
  };

  return {
    loadMatchableIntake: unavailable,
    listCandidates: unavailable,
    saveRun: unavailable,
    findRun: unavailable,
    findLatestRun: unavailable,
    findPreviousRun: unavailable,
    resolveNextAttempt: unavailable,
    readVocabularyNames: unavailable,
  };
}
