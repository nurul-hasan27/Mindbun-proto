import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { isUuid } from '../../../data/validators.js';
import { recommendTherapist } from '../../../data/matching/matchService.js';
import type { FeedbackRepository } from '../../../data/matching/feedbackRepository.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';
import { matchResponseSchema } from '../schemas/matches.js';
import type { NoCandidateResponse, RecommendationResponse } from '../schemas/recommendation.js';
import { toRecommendation } from './recommendationBody.js';
import { errorResponseSchema, type ErrorResponse } from '../schemas/therapists.js';

/**
 * `POST /api/v1/matches`.
 *
 * ## The client does not get to choose
 *
 * The body is `{ intakeId }` and nothing else. There is no way to ask "does this
 * therapist match me?" and no way to name a therapist and have it matched, because
 * both would put the decision in the place it must not be. A caller who wants to know
 * whether a given therapist would have been recommended can read the stored run,
 * which records every candidate including the ones set aside — for a human reviewer,
 * not for a browser.
 *
 * The engine runs on the server, in one place, and the answer it gives is the answer.
 *
 * ## It answers with the *current* recommendation
 *
 * If a rematch has already happened on this intake, this is the newest pass — the
 * person the client is actually on. Returning the first pass would show them the
 * person they just turned down, which is the opposite of what they asked for.
 *
 * ## It is safe to call more than once
 *
 * An existing pass is returned unchanged rather than recomputed. The engine is
 * deterministic, so a second run could not produce a different answer, and writing a
 * second pass at the same number would imply it might. Asking for another option is a
 * different request, with a different endpoint, and it writes the *next* pass.
 */
const MATCH_DOCS = {
  tags: ['matching'],
  summary: 'Find someone who may fit, and say why',
  description:
    'Runs the matching engine over the stored intake for that id, records every candidate it considered, and answers with one person and the reasons. Safe to call more than once: an existing decision is returned again rather than recomputed. If this intake has already been rematched, you get the most recent recommendation.',
} as const;

function badRequest(message: string): ErrorResponse {
  return { statusCode: 400, error: 'Bad Request', message };
}

export function buildMatchRoutes(
  matches: MatchRepository,
  therapists: TherapistRepository,
  /**
   * Only used to answer "what changed" after a rematch. A caller without one still
   * gets a correct recommendation, with an empty section — which is a gap rather than
   * a guess, and is documented as such on `RecommendDeps`.
   */
  feedback?: FeedbackRepository,
): FastifyPluginCallback {
  return (app, _options, done) => {
    app.post(
      '/matches',
      {
        schema: {
          ...MATCH_DOCS,
          body: {
            type: 'object',
            properties: { intakeId: { type: 'string', format: 'uuid' } },
            required: ['intakeId'],
            // `additionalProperties` is deliberately *not* declared here. The handler
            // checks for extra fields itself, because a rejection from the validator
            // reads "body must NOT have additional properties" and the person reading
            // it deserves a sentence instead. See `unknownFields` below.
          },
          response: {
            200: matchResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Checked here rather than left to the JSON Schema, so the refusal can be a
        // sentence. This matters more than usual on this endpoint: the one field a
        // caller is most likely to add is a therapist id, and quietly accepting it
        // would suggest the server had honoured a request it had not.
        const extra = unknownFields(request.body);

        if (extra.length > 0) {
          return await reply
            .status(400)
            .send(
              badRequest(
                'We only take the reference to what you shared. A match is worked out here, from what you told us — it cannot be asked for directly.',
              ),
            );
        }

        // Read defensively rather than trusting the schema to have run: a body that
        // is not an object at all still has to produce a sentence, not a crash.
        const intakeId = readIntakeId(request.body);

        if (!isUuid(intakeId)) {
          return await reply
            .status(400)
            .send(badRequest('That does not identify an intake we have stored.'));
        }

        try {
          const outcome = await recommendTherapist(intakeId, {
            matches,
            therapists,
            ...(feedback === undefined ? {} : { feedback }),
          });

          if (outcome.kind === 'unknown-intake') {
            return await reply.status(404).send({
              statusCode: 404,
              error: 'Not Found',
              message: 'We do not have an intake with that reference.',
            });
          }

          if (outcome.result.kind === 'no-candidate') {
            const nothingQualified: NoCandidateResponse = {
              outcome: 'no_candidate',
              considered: outcome.result.considered,
            };

            return await reply.send(nothingQualified);
          }

          return await reply.send(toRecommendation(outcome.result));
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    done();
  };
}

/** Field names in the body that this endpoint does not accept. */
function unknownFields(body: unknown): readonly string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [];
  }

  return Object.keys(body).filter((key) => key !== 'intakeId');
}

/** The body's `intakeId`, or an empty string when there is not one to read. */
function readIntakeId(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('intakeId' in body)) {
    return '';
  }

  // The `in` check above has already narrowed this, so no cast is needed.
  return typeof body.intakeId === 'string' ? body.intakeId : '';
}

export function sendStoreFailure(
  app: { log: { error: (payload: unknown, message?: string) => void } },
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof DataStoreUnavailableError) {
    app.log.error({ err: error }, 'match store unavailable');
    return reply.status(503).send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'We could not reach where matches are recorded right now.',
    });
  }

  app.log.error({ err: error }, 'unexpected match route failure');
  return reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Something went wrong while finding your match.',
  });
}

export type { RecommendationResponse };
