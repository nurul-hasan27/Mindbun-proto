import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import type { IntakeRepository } from '../../../data/intake/intakeRepository.js';
import { validateIntakeRequest } from '../../../data/intake/intakeValidation.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';
import {
  intakeReceiptSchema,
  intakeVocabularyResponseSchema,
  type IntakeReceiptResponse,
  type IntakeVocabularyResponse,
} from '../schemas/intake.js';
import { errorResponseSchema, type ErrorResponse } from '../schemas/therapists.js';

/**
 * `GET /api/v1/intake/vocabulary` and `POST /api/v1/intakes`.
 *
 * The repository arrives as an argument, so the API can be tested without a
 * database, and the composition root is the only place that knows which store is
 * in use.
 */
const VOCABULARY_DOCS = {
  tags: ['intake'],
  summary: 'Everything an intake may ask about',
  description:
    'The areas of work, conversation styles, contexts, languages and session formats that exist. The client asks for its questions to be about real data rather than a hardcoded list.',
} as const;

const SUBMIT_DOCS = {
  tags: ['intake'],
  summary: 'Store an intake and the preferences that came with it',
  description:
    'Creates a client for this anonymous session if there is not one already, stores the intake, and replaces that client preference set. Safe to retry: a repeated submissionId returns the intake that was already stored.',
} as const;

function badRequest(message: string): ErrorResponse {
  return { statusCode: 400, error: 'Bad Request', message };
}

export function buildIntakeRoutes(repository: IntakeRepository): FastifyPluginCallback {
  return (app, _options, done) => {
    app.get(
      '/intake/vocabulary',
      {
        schema: {
          ...VOCABULARY_DOCS,
          response: {
            200: intakeVocabularyResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (_request, reply) => {
        try {
          const vocabulary: IntakeVocabularyResponse = await repository.readVocabulary();
          return await reply.send(vocabulary);
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    app.post(
      '/intakes',
      {
        schema: {
          ...SUBMIT_DOCS,
          response: {
            200: intakeReceiptSchema,
            400: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        let vocabulary;

        try {
          vocabulary = await repository.readVocabulary();
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }

        // Validated here rather than by a body schema so that the answer is a
        // sentence: a person who cannot fix a 400 does not need to read one.
        const validated = validateIntakeRequest(request.body, vocabulary);

        if (!validated.ok) {
          return await reply.status(400).send(badRequest(validated.message));
        }

        try {
          const stored: IntakeReceiptResponse = await repository.submit(validated.request);
          return await reply.send(stored);
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    done();
  };
}

function sendStoreFailure(
  app: { log: { error: (payload: unknown, message?: string) => void } },
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof DataStoreUnavailableError) {
    app.log.error({ err: error }, 'intake store unavailable');
    return reply.status(503).send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'We could not reach where answers are stored right now.',
    });
  }

  app.log.error({ err: error }, 'unexpected intake route failure');
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Something went wrong while saving what you shared.',
  });
}
