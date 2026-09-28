import type { FastifyPluginCallback } from 'fastify';
import { isUuid } from '../../../data/validators.js';
import type { FeedbackReasonKey } from '../../../data/matching/feedbackTypes.js';
import type { FeedbackRepository } from '../../../data/matching/feedbackRepository.js';
import { recordFeedback, requestRematch } from '../../../data/matching/feedbackService.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import {
  feedbackReceiptSchema,
  feedbackReasonsSchema,
  rematchResponseSchema,
  type FeedbackReceiptResponse,
} from '../schemas/feedback.js';
import type { NoCandidateResponse } from '../schemas/recommendation.js';
import { toRecommendation } from './recommendationBody.js';
import { sendStoreFailure } from './matches.js';
import { errorResponseSchema, type ErrorResponse } from '../schemas/therapists.js';

/**
 * `POST /api/v1/matches/:matchId/feedback` and `POST /api/v1/matches/:matchId/rematch`.
 *
 * ## The only input is a match id
 *
 * Both requests carry one thing: the match being responded to. From it the server
 * derives the client, the intake, the therapist, the exclusion set, the pass number and
 * the weights. There is no field through which a browser could name a client, name a
 * therapist, add to the exclusion list, submit a weight, or ask for a particular person
 * — and that is the whole of the security model here, rather than a list of checks that
 * could be forgotten.
 *
 * ## "I don't know that match" and "not your match" are the same answer
 *
 * Both are a `404` with the same sentence. A caller who could tell them apart would
 * have an enumeration oracle: they could confirm that an id exists by asking about
 * someone else's. Not being able to tell is the feature.
 *
 * ## A rematch is a second pass, not a rewrite
 *
 * Pass 1 is never touched. The new rows are pass 2, and the old recommendation keeps
 * its evidence and its `DECLINED` status, so the history reads as a sequence and a
 * reviewer can see what was offered, what was said about it, and what came next.
 */
const FEEDBACK_DOCS = {
  tags: ['matching'],
  summary: 'Say what did not fit, and look again',
  description:
    'Records what you said about this recommendation and marks it as turned down. The client, the therapist and the intake are all read from the match, so nothing about anyone else can be named here. Safe to retry: a repeated submission returns the first answer rather than recording a second opinion.',
} as const;

const REMATCH_DOCS = {
  tags: ['matching'],
  summary: 'Look again, taking the feedback into account',
  description:
    'Runs the same matching engine again with two differences: everyone already turned down on this intake is left out, and the things you mentioned count for more. The previous recommendation is kept, not replaced. Returns the new person, the reasons, and what is demonstrably different about them.',
} as const;

/** Long enough for a paragraph, short enough that it is not a diary entry. */
const MAX_TEXT_LENGTH = 2_000;

/** The whole of what a person may say about a recommendation. */
const FEEDBACK_FIELDS: readonly string[] = ['reasons', 'rawText'];

function badRequest(message: string): ErrorResponse {
  return { statusCode: 400, error: 'Bad Request', message };
}

function unknownMatch(): ErrorResponse {
  return {
    statusCode: 404,
    error: 'Not Found',
    message: 'We do not have a recommendation with that reference.',
  };
}

export function buildFeedbackRoutes(
  feedback: FeedbackRepository,
  matches: MatchRepository,
  therapists: TherapistRepository,
): FastifyPluginCallback {
  return (app, _options, done) => {
    /**
     * `GET /api/v1/feedback/reasons`
     *
     * The terms on offer, from the database. A `GET`, because it is a pure read of
     * data and caching it is right.
     */
    app.get(
      '/feedback/reasons',
      {
        schema: {
          tags: ['matching'],
          summary: 'The terms someone can pick from',
          description:
            'The reasons a recommendation might not have felt right, read from the database. The key is what the engine matches on; the wording is what you read, and the two are allowed to differ.',
          response: { 200: feedbackReasonsSchema, 503: errorResponseSchema },
        },
      },
      async (_request, reply) => {
        try {
          const reasons = await feedback.readReasons();

          return await reply.send({ reasons });
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    app.post<{ Params: { matchId: string } }>(
      '/matches/:matchId/feedback',
      {
        schema: {
          ...FEEDBACK_DOCS,
          params: {
            type: 'object',
            properties: { matchId: { type: 'string', format: 'uuid' } },
            required: ['matchId'],
          },
          body: {
            type: 'object',
            properties: {
              reasons: { type: 'array', items: { type: 'string' } },
              rawText: { type: 'string' },
            },
            // `minItems` and `maxLength` are deliberately absent. Fastify's validator
            // would enforce them, and its refusals read
            // "body/reasons must NOT have fewer than 1 items" — which is exactly the
            // kind of message this project refuses to show a person. Both are checked by
            // hand below so the answer is a sentence.
          },
          response: {
            201: feedbackReceiptSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const matchId = request.params.matchId;

        if (!isUuid(matchId)) {
          return await reply
            .status(400)
            .send(badRequest('That does not identify a recommendation we have.'));
        }

        const body = request.body as { reasons?: unknown; rawText?: unknown } | undefined;
        const rejected = rejectUnknownFields(body, FEEDBACK_FIELDS);

        if (rejected !== null) {
          return await reply.status(400).send(rejected);
        }

        const reasons = readReasons(body?.reasons);

        if (reasons === null || reasons.length === 0) {
          return await reply.status(400).send(badRequest('Pick at least one reason, please.'));
        }

        const rawText = readText(body?.rawText);

        if (rawText === null) {
          return await reply
            .status(400)
            .send(badRequest('That note is too long, or empty of anything we could keep.'));
        }

        try {
          // Checked here as well as in the service, so the refusal can be a sentence and
          // so a key nobody has a matching rule for never reaches storage. The service
          // repeats the check as a second lock: two places that both refuse beats one
          // that has to be remembered.
          const known = new Set((await feedback.readReasons()).map((reason) => reason.key));

          if (reasons.some((key) => !known.has(key))) {
            return await reply
              .status(400)
              .send(badRequest('That is not one of the reasons we offer. Choose from the list.'));
          }

          const outcome = await recordFeedback(
            matchId,
            {
              reasons,
              rawText: rawText ?? undefined,
            },
            { feedback },
          );

          if (outcome.kind === 'unknown-match') {
            return await reply.status(404).send(unknownMatch());
          }

          if (outcome.kind === 'already-declined') {
            return await reply.status(409).send({
              statusCode: 409,
              error: 'Conflict',
              message:
                'You have already told us about this one, and we are looking for someone different.',
            });
          }

          const receipt: FeedbackReceiptResponse = outcome.receipt;
          return await reply.status(201).send(receipt);
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    app.post<{ Params: { matchId: string } }>(
      '/matches/:matchId/rematch',
      {
        schema: {
          ...REMATCH_DOCS,
          params: {
            type: 'object',
            properties: { matchId: { type: 'string', format: 'uuid' } },
            required: ['matchId'],
          },
          response: {
            200: rematchResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const matchId = request.params.matchId;

        if (!isUuid(matchId)) {
          return await reply
            .status(400)
            .send(badRequest('That does not identify a recommendation we have.'));
        }

        // Nothing is accepted here. The exclusion set, the weights and the pass number
        // are all worked out from what is stored, so a body has no field a caller is
        // meant to fill in — and a field we do not recognise is a field someone expected
        // us to honour.
        const rejected = rejectUnknownFields(request.body, []);

        if (rejected !== null) {
          return await reply.status(400).send(rejected);
        }

        try {
          const outcome = await requestRematch(matchId, { feedback, matches, therapists });

          switch (outcome.kind) {
            case 'unknown-match':
              return await reply.status(404).send(unknownMatch());

            case 'no-feedback':
              return await reply.status(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'Tell us what did not fit first, so we know what to look for differently.',
              });

            case 'already-looked-again':
              // Not an error the person can act on, so the answer is the thing they
              // actually wanted: where to go next.
              return await reply.status(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'We have already looked past this one. The other person is waiting.',
              });

            case 'no-candidate': {
              const exhausted: NoCandidateResponse = {
                outcome: 'no_candidate',
                considered: outcome.remaining,
              };
              return await reply.send(exhausted);
            }

            case 'rematched':
              return await reply.send(toRecommendation(outcome));
          }
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    done();
  };
}

function readReasons(value: unknown): readonly FeedbackReasonKey[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const reasons = value.filter((entry): entry is string => typeof entry === 'string');

  if (reasons.length !== value.length) {
    return null;
  }

  return reasons;
}

function readText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    // An empty note is the same as not writing one, which the interface allows.
    return undefined;
  }

  return trimmed.length <= MAX_TEXT_LENGTH ? trimmed : null;
}

/**
 * Anything beyond the documented fields is refused with a sentence.
 *
 * The same reasoning as the matching route: Fastify's validator strips undeclared
 * properties rather than rejecting them, and quietly ignoring a field a caller thought
 * was meaningful is worse than saying it was ignored. It matters most here, because the
 * fields one might expect to be accepted — a client id, a therapist to exclude, a
 * weight — are precisely the ones that must not be.
 */
function rejectUnknownFields(body: unknown, allowedKeys: readonly string[]): ErrorResponse | null {
  if (body === undefined || body === null) {
    return null;
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('We can only take what you told us about this match.');
  }

  const allowed = new Set(allowedKeys);
  const extra = Object.keys(body as Record<string, unknown>).filter((key) => !allowed.has(key));

  if (extra.length > 0) {
    return badRequest(
      'We work out who you saw and who to look for next, from the recommendation itself — so there is nothing for you to name here.',
    );
  }

  return null;
}
