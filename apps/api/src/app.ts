import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import type { ErrorResponse } from './lib/responses.js';
import { healthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  /** Set to false in tests to silence request logging. */
  readonly logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger === false ? false : { level: env.logLevel },
  });

  app.register(cors, {
    origin: [...env.corsOrigins],
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    const statusCode = error.statusCode ?? 500;
    const body: ErrorResponse = {
      status: 'error',
      message: statusCode >= 500 && env.isProduction ? 'Internal server error' : error.message,
    };

    void reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorResponse = {
      status: 'error',
      message: `Route ${request.method} ${request.url} not found`,
    };

    void reply.status(404).send(body);
  });

  app.register(healthRoutes);

  return app;
}
