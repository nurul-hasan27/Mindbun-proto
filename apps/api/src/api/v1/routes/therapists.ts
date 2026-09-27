import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import {
  DataStoreUnavailableError,
  type TherapistRepository,
} from '../../../data/therapists/therapistRepository.js';
import {
  errorResponseSchema,
  therapistListResponseSchema,
  therapistProfileSchema,
  type ErrorResponse,
  type TherapistListResponse,
} from '../schemas/therapists.js';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 12;

interface ListQuerystring {
  take?: string;
  skip?: string;
  language?: string;
  area?: string;
}

interface IdParams {
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OpenAPI-style documentation. Fastify itself ignores these fields; they are
 * here so the route's intent is written down next to the code, and so adding
 * @fastify/swagger later would be a one-line change rather than a rewrite.
 */
const LIST_DOCS = {
  tags: ['therapists'],
  summary: 'List therapists',
  description:
    'A page of therapist summaries, ordered by name. Optionally narrowed by language or area of work.',
} as const;

const PROFILE_DOCS = {
  tags: ['therapists'],
  summary: 'Get one therapist profile',
  description: 'The full profile, including availability in the therapist own timezone.',
} as const;

function readInteger(
  raw: string | undefined,
  fallback: number,
  { min, max, name }: { min: number; max: number; name: string },
): number | ErrorResponse {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return {
      statusCode: 400,
      error: 'Bad Request',
      message: `${name} must be a whole number between ${min} and ${max}.`,
    };
  }

  return value;
}

/**
 * `/api/v1/therapists` and `/api/v1/therapists/:id`.
 *
 * The repository arrives as an argument rather than being imported, which is
 * what lets the whole API be tested without a database. Filtering is limited to
 * two things a person could plausibly ask a directory for — a language and an
 * area of work — and stops well short of matching.
 */
export function buildTherapistRoutes(repository: TherapistRepository): FastifyPluginCallback {
  return (app, _options, done) => {
    app.get<{ Querystring: ListQuerystring }>(
      '/therapists',
      {
        schema: {
          ...LIST_DOCS,
          querystring: {
            type: 'object',
            // Deliberately no `pattern` here: Fastify's own validation answers
            // first, and its message ("querystring/skip must match pattern …") is
            // exactly the kind of technical text this API does not send. The
            // handler validates these values and explains them in words instead.
            properties: {
              take: { type: 'string' },
              skip: { type: 'string' },
              language: { type: 'string', minLength: 2, maxLength: 8 },
              area: { type: 'string', minLength: 1, maxLength: 64 },
            },
            additionalProperties: false,
          },
          response: {
            200: therapistListResponseSchema,
            400: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const take = readInteger(request.query.take, DEFAULT_PAGE_SIZE, {
          min: 1,
          max: MAX_PAGE_SIZE,
          name: 'take',
        });
        if (typeof take !== 'number') {
          return reply.status(400).send(take);
        }

        const skip = readInteger(request.query.skip, 0, { min: 0, max: 100_000, name: 'skip' });
        if (typeof skip !== 'number') {
          return reply.status(400).send(skip);
        }

        const { language, area } = request.query;

        if (language !== undefined && !(await repository.hasLanguage(language))) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: `No language is recorded with the code "${language}".`,
          });
        }

        if (area !== undefined && !(await repository.hasArea(area))) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: `No area of work is recorded with the key "${area}".`,
          });
        }

        try {
          const { items, total } = await repository.list({ take, skip, language, area });

          const response: TherapistListResponse = {
            items: [...items],
            pagination: { total, take, skip, hasMore: skip + items.length < total },
          };
          return await reply.send(response);
        } catch (error) {
          return await sendStoreFailure(app, reply, error);
        }
      },
    );

    app.get<{ Params: IdParams }>(
      '/therapists/:id',
      {
        schema: {
          ...PROFILE_DOCS,
          params: {
            type: 'object',
            // No `format: 'uuid'` either: the same reason. The handler decides
            // what a caller is told about a malformed id.
            properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
            required: ['id'],
            additionalProperties: false,
          },
          response: {
            200: therapistProfileSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        // A malformed id is a bad request, not a missing therapist: the two mean
        // different things to whoever is calling.
        if (!UUID_PATTERN.test(id)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'A therapist id must be a UUID.',
          });
        }

        try {
          const profile = await repository.findById(id);

          if (profile === null) {
            return await reply.status(404).send({
              statusCode: 404,
              error: 'Not Found',
              message: 'No therapist has that id.',
            });
          }

          return await reply.send(profile);
        } catch (error) {
          return await sendStoreFailure(app, reply, error);
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
    app.log.error({ err: error }, 'therapist store unavailable');
    return reply.status(503).send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'The therapist store is not available right now.',
    });
  }

  app.log.error({ err: error }, 'unexpected therapist route failure');
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Something went wrong while looking up therapists.',
  });
}
