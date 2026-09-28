import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { AiUnavailableError, type AiProvider } from '../../../ai/aiProvider.js';
import { buildCaseContext } from '../../../ai/caseContext.js';
import { assertGroundedIn } from '../../../ai/grounding.js';
import { findCase, type WorkspaceDeps } from '../../../data/matching/workspaceService.js';
import { isUuid } from '../../../data/validators.js';
import {
  aiMatchSummaryResponseSchema,
  type AiMatchSummaryResponse,
} from '../schemas/ai.js';
import { errorResponseSchema, type ErrorResponse } from '../schemas/therapists.js';
import { sendStoreFailure } from './matches.js';

/**
 * `GET /api/v1/matching-workspace/cases/:matchId/ai-summary`.
 *
 * ## It lives under `/matching-workspace`, and that is the point
 *
 * Phase 7 namespaced every internal route and then tested that no client-facing schema has
 * a field a case could travel in. Putting the AI summary in the same namespace means it
 * inherits that boundary rather than needing a new one argued for: it is greppable
 * alongside the rest of the reviewer's surface, and when a guard is eventually mounted in
 * one place, this is already behind it.
 *
 * There is no client-facing route that reaches it. A client cannot obtain a case summary,
 * and cannot ask for a summary of anything but a case it already has — which it cannot have.
 *
 * ## A `GET`, and no body
 *
 * The request is a path parameter and a UUID. There is no field through which a browser
 * could name a therapist, an intake, a client, or a piece of text to be summarised, so the
 * "never trust browser-provided vocabulary keys or therapist ids" rule has nothing to
 * enforce: the only thing a caller supplies is *which case*, and the server loads the rest
 * from storage.
 *
 * Nothing is stored. The summary is recomputed on each request from the same rows the
 * evidence came from, which means it cannot go stale relative to the evidence beside it, and
 * there is no table of model output to accumulate. That is also why it is a `GET`: it is a
 * read of a derived view, not a write that happens to return prose.
 *
 * ## What a refused summary means here
 *
 * `assertGroundedIn` refuses a summary that mentions anything the case does not contain, or
 * that reaches for a score, a rank, a verdict, or clinical language. A refusal is a `502`
 * with a sentence and a log line naming the reason — never the summary, and never the
 * invented words themselves, since the log is read by people and the free text is not meant
 * to be. The matcher sees a quiet notice that the summary is unavailable and the evidence
 * they came for, unchanged.
 */

const DOCS = {
  tags: ['matching-workspace'],
  summary: 'A short summary of a case, written from its structured data',
  description:
    'Internal. Two or three sentences on what the client asked for and how the current suggestion sits against it, plus a few things worth reviewing. Built from stored evidence only: no free text, no biography, no score, no rank. Refused if any claim cannot be traced to a field in the case, because a plausible summary that invented a reason is worse than no summary.',
} as const;

function unknownCase(): ErrorResponse {
  return {
    statusCode: 404,
    error: 'Not Found',
    message: 'We could not find that case.',
  };
}

export interface AiWorkspaceRouteDeps extends WorkspaceDeps {
  readonly ai: AiProvider;
}

export function buildAiWorkspaceRoutes(deps: AiWorkspaceRouteDeps): FastifyPluginCallback {
  return (app, _options, done) => {
    app.get<{ Params: { matchId: string } }>(
      '/matching-workspace/cases/:matchId/ai-summary',
      {
        schema: {
          ...DOCS,
          params: {
            type: 'object',
            properties: { matchId: { type: 'string' } },
            required: ['matchId'],
            additionalProperties: false,
          },
          response: {
            200: aiMatchSummaryResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!deps.ai.available) {
          return reply.status(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'The case summary is switched off. The evidence below is unchanged.',
          });
        }

        if (!isUuid(request.params.matchId)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'That is not a case reference.',
          });
        }

        try {
          // No `revealWords`, so the client's own words are never loaded. This is the same
          // default Phase 7 established, reached here rather than re-argued: the summary is
          // built from structured matching data, full stop.
          //
          // Inside the try, because `findCase` reaches the store on our behalf and can fail
          // there — and a store failure reported as a 500 tells a matcher the *service* is
          // broken, when in fact nothing has been asked of the assistant yet.
          const detail = await findCase(request.params.matchId, deps);

          if (detail === null) {
            return reply.status(404).send(unknownCase());
          }

          const context = buildCaseContext(detail);
          const proposed = await deps.ai.summariseCase(context);
          const grounded = assertGroundedIn(proposed, context);

          if (!grounded.ok) {
            // The reason, not the summary. A developer swapping providers needs to know
            // *which* word was invented; a person reading a log should not be shown model
            // output, and the case's own free text is not in it either way.
            request.log.warn({ reason: grounded.reason }, 'ai case summary refused');
            return reply.status(502).send({
              statusCode: 502,
              error: 'Bad Gateway',
              message: 'The case summary could not be trusted, so it has been left out. The evidence is unchanged.',
            });
          }

          const response: AiMatchSummaryResponse = {
            summary: grounded.summary.summary,
            observations: grounded.summary.observations,
            tradeoffs: grounded.summary.tradeoffs,
            provider: deps.ai.name,
          };

          return reply.send(response);
        } catch (error) {
          if (error instanceof AiUnavailableError) {
            request.log.warn({ reason: error.name }, 'ai case summary unavailable');
            return reply.status(502).send({
              statusCode: 502,
              error: 'Bad Gateway',
              message: 'The case summary could not be produced. The evidence is unchanged.',
            });
          }

          return sendStoreFailure(request, reply, error);
        }
      },
    );

    done();
  };
}

/** Re-exported so a future route can reuse the reply type without importing Fastify twice. */
export type AiSummaryReply = FastifyReply;
