import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { isUuid } from '../../../data/validators.js';
import { recommendTherapist } from '../../../data/matching/matchService.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { DataStoreUnavailableError } from '../../../data/storeErrors.js';
import {
  matchResponseSchema,
  noCandidateResponseSchema,
  type MatchResponse,
  type NoCandidateResponse,
} from '../schemas/matches.js';
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
 */
const MATCH_DOCS = {
  tags: ['matching'],
  summary: 'Find someone who may fit, and say why',
  description:
    'Runs the matching engine over the stored intake for that id, records every candidate it considered, and answers with one person and the reasons. Safe to call more than once: an intake is evaluated once and the stored decision is returned again.',
} as const;

function badRequest(message: string): ErrorResponse {
  return { statusCode: 400, error: 'Bad Request', message };
}

export function buildMatchRoutes(
  matches: MatchRepository,
  therapists: TherapistRepository,
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
            200: {
              oneOf: [matchResponseSchema, noCandidateResponseSchema],
            },
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
          const outcome = await recommendTherapist(intakeId, { matches, therapists });

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

          const { matchId, decidedAt, therapist, evidence } = outcome.result;

          const found: MatchResponse = {
            matchId,
            decidedAt,
            therapist: {
              id: therapist.id,
              displayName: therapist.displayName,
              headline: therapist.headline,
              bio: therapist.bio,
              location: therapist.location,
              timezone: therapist.timezone,
              yearsOfExperience: therapist.yearsOfExperience,
              languages: therapist.languages.map(attribute),
              areasOfWork: therapist.areasOfWork.map(attribute),
              communicationStyles: therapist.communicationStyles.map(attribute),
              approaches: therapist.approaches.map(attribute),
              contextualExperience: therapist.contextualExperience.map(attribute),
              sessionFormats: therapist.sessionFormats.map(attribute),
              availability: therapist.availability.map((window) => ({
                dayOfWeek: window.dayOfWeek,
                startMinute: window.startMinute,
                endMinute: window.endMinute,
              })),
            },
            whyThisMatch: evidence.map((item) => ({
              key: item.key,
              sentence: item.sentence,
              detail: item.detail,
            })),
          };

          return await reply.send(found);
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    done();
  };
}

function attribute(entry: { key: string; name: string }): { key: string; name: string } {
  return { key: entry.key, name: entry.name };
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

function sendStoreFailure(
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
