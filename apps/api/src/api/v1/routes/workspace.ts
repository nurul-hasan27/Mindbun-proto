import type { FastifyPluginCallback } from 'fastify';
import { isUuid } from '../../../data/validators.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import {
  decide,
  findCase,
  listCases,
  type WorkspaceDeps,
} from '../../../data/matching/workspaceService.js';
import type { WorkspaceRepository } from '../../../data/matching/workspaceRepository.js';
import {
  caseDetailSchema,
  caseListSchema,
  clientsWordsSchema,
  decisionResultSchema,
  type CaseDetailResponse,
  type CaseSummaryResponse,
  type DecisionResultResponse,
} from '../schemas/workspace.js';
import { sendStoreFailure } from './matches.js';
import { errorResponseSchema, type ErrorResponse } from '../schemas/therapists.js';

/**
 * `/api/v1/matching-workspace/*` — the reviewer's side.
 *
 * ## Authentication is intentionally absent
 *
 * **No authentication and no authorization are implemented in this prototype, and none is
 * faked.** There is no login screen, no session, no token, and no "signed in as" anywhere
 * in this codebase. What there is instead is a shape that makes the intent unmistakable
 * and the eventual work small:
 *
 * - The paths are namespaced under `/matching-workspace`, so they are greppable as a group
 *   and can be mounted behind a guard in one place when there is something to guard with.
 * - **No endpoint here accepts a client id, an intake id or a therapist id.** Every read
 *   is reached from a case's match id, and the one write names a candidate from the set
 *   that case already offered. A caller cannot steer a review of a client they did not
 *   choose, because there is nowhere to name one.
 * - `MatchingDecision` has no `decidedBy` column, because inventing a matcher's name
 *   would be fabricating an identity the system does not have.
 *
 * The boundary that *is* enforced in this phase is the one that does not need accounts:
 * **nothing here is reachable from a client-facing response.** The client API has its own
 * schemas, none of which has a field a decision, a matcher note, or an alternative
 * candidate could travel in, and tests read the serialised bodies to prove it.
 *
 * ## The body of a decision
 *
 * `{ selectedMatchId, reasons, note? }` and nothing else. The `decisionType` is **derived
 * server-side** from which candidate was chosen, so there is no field through which a
 * caller could file "accepted the system suggestion" as an override, or an override as an
 * acceptance — the distinction is a fact about the data rather than a claim in a request.
 */
const CASES_DOCS = {
  tags: ['matching-workspace'],
  summary: 'Cases waiting for a human decision',
  description:
    'Internal. Every current recommendation that no human matcher has reviewed. Authentication and authorization are intentionally not implemented in this prototype — see docs/human-matching.md.',
} as const;

const CASE_DOCS = {
  tags: ['matching-workspace'],
  summary: 'One case in full',
  description:
    'Internal. What the client asked for, who the engine suggested, the evidence for that, a small set of other candidates, and what has been decided. No score, no rank, no weight: the case for disagreeing is evidence. Free text is excluded unless clientsWords is asked for.',
} as const;

const WORDS_DOCS = {
  tags: ['matching-workspace'],
  summary: "The client's own words, behind an opt-in",
  description:
    'Internal. A separate request on purpose, so reaching for a client’s free text is a visible act rather than a field that happened to be populated. Never logged, and reachable from no client-facing endpoint.',
} as const;

const DECISION_DOCS = {
  tags: ['matching-workspace'],
  summary: 'Record what a matcher decided',
  description:
    'Internal. Records a decision beside the engine’s recommendation; it does not modify it. A candidate the engine set aside cannot be chosen, and choosing a different one requires saying why. Safe to retry: a repeated call returns the first decision.',
} as const;

const MAX_NOTE_LENGTH = 2_000;

function badRequest(message: string): ErrorResponse {
  return { statusCode: 400, error: 'Bad Request', message };
}

function unknownCase(): ErrorResponse {
  return {
    statusCode: 404,
    error: 'Not Found',
    message: 'We do not have a case with that reference.',
  };
}

const MATCH_ID_PARAMS = {
  type: 'object',
  properties: { matchId: { type: 'string' } },
  required: ['matchId'],
} as const;

export function buildWorkspaceRoutes(
  workspace: WorkspaceRepository,
  matches: MatchRepository,
  therapists: TherapistRepository,
): FastifyPluginCallback {
  const deps: WorkspaceDeps = { workspace, matches, therapists };

  return (app, _options, done) => {
    app.get(
      '/matching-workspace/cases',
      {
        schema: {
          ...CASES_DOCS,
          response: { 200: caseListSchema, 503: errorResponseSchema },
        },
      },
      async (_request, reply) => {
        try {
          const cases: readonly CaseSummaryResponse[] = await listCases(deps);
          return await reply.send({ cases });
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    app.get<{ Params: { matchId: string }; Querystring: { clientsWords?: string } }>(
      '/matching-workspace/cases/:matchId',
      {
        schema: {
          ...CASE_DOCS,
          params: MATCH_ID_PARAMS,
          querystring: {
            type: 'object',
            properties: { clientsWords: { type: 'string' } },
          },
          response: {
            200: caseDetailSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!isUuid(request.params.matchId)) {
          return await reply.status(400).send(badRequest('That does not identify a case.'));
        }

        // Opt-in, and only the exact value that asks for it. Anything else — `true`, `1`,
        // an empty string — leaves the free text out, because a flag that turns itself on
        // for any non-empty value is a flag that will eventually be on by accident.
        const revealWords = request.query.clientsWords === 'reveal';

        try {
          const record = await findCase(request.params.matchId, deps, {
            revealWords,
          });

          if (record === null) {
            return await reply.status(404).send(unknownCase());
          }

          const body: CaseDetailResponse = {
            summary: record.summary,
            needs: record.needs,
            suggestion: {
              matchId: record.suggestion.matchId,
              therapist: record.suggestion.therapist,
              eligible: true,
              rejectionCode: null,
              shared: record.suggestion.shared,
              notOffered: record.suggestion.notOffered,
            },
            alternatives: record.alternatives.map((candidate) => ({
              matchId: candidate.matchId,
              therapist: candidate.therapist,
              eligible: candidate.eligible,
              rejectionCode: candidate.rejectionCode,
              shared: candidate.shared,
              notOffered: candidate.notOffered,
            })),
            selectableMatchIds: record.selectableMatchIds,
            decisionReasons: record.decisionReasons,
            journey: record.journey,
            decision: record.decision,
            clientsWords: revealWords ? record.clientsWords : null,
          };

          return await reply.send(body);
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    app.get<{ Params: { matchId: string } }>(
      '/matching-workspace/cases/:matchId/clients-words',
      {
        schema: {
          ...WORDS_DOCS,
          params: MATCH_ID_PARAMS,
          response: {
            200: clientsWordsSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!isUuid(request.params.matchId)) {
          return await reply.status(400).send(badRequest('That does not identify a case.'));
        }

        try {
          const record = await findCase(request.params.matchId, deps, {
            revealWords: true,
          });

          if (record === null) {
            return await reply.status(404).send(unknownCase());
          }

          return await reply.send(record.clientsWords ?? { intakeNote: null, feedbackNotes: [] });
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    app.post<{ Params: { matchId: string } }>(
      '/matching-workspace/cases/:matchId/decision',
      {
        schema: {
          ...DECISION_DOCS,
          params: MATCH_ID_PARAMS,
          // The three fields are declared **without types**, and every one of them is
          // checked by hand below. That is a deliberate choice, and it is the only one that
          // gets this body right.
          //
          // Fastify's AJV coerces by default: with a type declared, `[7]` arrives as
          // `["7"]`, `5` as `["5"]` and `null` as `[""]`. A caller could then persist a
          // justification the vocabulary has never heard of, stringified, as though a
          // matcher had chosen it — and the audit trail would hold it in good faith.
          //
          // Declaring no type means there is nothing to coerce, the raw value reaches the
          // handler, and every malformed shape is refused with a sentence written for the
          // person reading it rather than a schema path. `additionalProperties` is left
          // unset for the same reason: the app-wide `removeAdditional: false` lets an
          // undeclared field through to the check below, and the field a caller would most
          // expect to be honoured — a client id, a therapist id — is the one that must not
          // be quietly dropped.
          body: {
            type: 'object',
            properties: {
              /**
               * A candidate from the ones this case offered, and no other.
               *
               * Not a therapist id, and there is nowhere in this body to name a client or
               * an intake. That is the whole of the internal security model.
               */
              selectedMatchId: {},
              /** Stable reason keys. Required when choosing an alternative. */
              reasons: {},
              /** The matcher's own words. Optional. */
              note: {},
            },
          },
          response: {
            200: decisionResultSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            422: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!isUuid(request.params.matchId)) {
          return await reply.status(400).send(badRequest('That does not identify a case.'));
        }

        // Checked before anything else, so a body carrying a client id is refused for
        // saying so rather than for whatever else happens to be wrong with it.
        const extra = unknownFields(request.body);

        if (extra.length > 0) {
          return await reply
            .status(400)
            .send(
              badRequest(
                'A decision is a choice between the candidates on this page. There is nothing else for you to name here.',
              ),
            );
        }

        const body = request.body as
          { selectedMatchId?: unknown; reasons?: unknown; note?: unknown } | undefined;

        const selectedMatchId =
          typeof body?.selectedMatchId === 'string' ? body.selectedMatchId : '';

        if (selectedMatchId === '') {
          return await reply.status(400).send(badRequest('Choose a therapist for this case.'));
        }

        const reasons = readReasons(body?.reasons);

        if (reasons === null) {
          return await reply
            .status(400)
            .send(badRequest('That is not one of the reasons offered.'));
        }

        const note = readNote(body?.note);

        if (note === null) {
          return await reply
            .status(400)
            .send(badRequest('That note is too long, or empty of anything we could keep.'));
        }

        try {
          const outcome = await decide(
            request.params.matchId,
            { selectedMatchId, reasons, note: note ?? undefined },
            deps,
          );

          switch (outcome.kind) {
            case 'unknown-case':
              return await reply.status(404).send(unknownCase());

            case 'already-decided':
              return await reply.status(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'This case has already been decided.',
              });

            case 'not-offered':
              return await reply.status(422).send({
                statusCode: 422,
                error: 'Unprocessable Entity',
                message: 'That therapist is not one of the candidates for this case.',
              });

            case 'set-aside':
              // A real limit on a matcher's authority, and a distinct answer from
              // "not offered" — this one is a rule, the other is a mistake.
              return await reply.status(422).send({
                statusCode: 422,
                error: 'Unprocessable Entity',
                message:
                  'This therapist did not meet something the client marked as important, so they cannot be put in front of them.',
              });

            case 'no-reason':
              return await reply.status(422).send({
                statusCode: 422,
                error: 'Unprocessable Entity',
                message: 'Say why this one fits better, so the decision can be read later.',
              });

            case 'decided': {
              const response: DecisionResultResponse = {
                decisionType: outcome.decisionType,
                selectedMatchId: outcome.selectedMatchId,
                selectedTherapistName: outcome.selectedTherapistName,
                systemSuggestedName: outcome.systemSuggestedName,
                differs: outcome.differs,
                recordedAt: outcome.recordedAt,
              };
              return await reply.send(response);
            }
          }
        } catch (error) {
          return sendStoreFailure(app, reply, error);
        }
      },
    );

    done();
  };
}

/**
 * The body of a decision, checked by hand rather than by the JSON Schema.
 *
 * `additionalProperties` is set app-wide to `removeAdditional: false`, so an undeclared
 * field reaches this handler rather than being silently stripped — and the one field a
 * caller would most expect to be honoured here is a client or therapist id, so quietly
 * dropping it would be the worst possible outcome.
 */
function unknownFields(body: unknown): readonly string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [];
  }

  const allowed = new Set(['selectedMatchId', 'reasons', 'note']);

  return Object.keys(body).filter((key) => !allowed.has(key));
}

/**
 * Reason keys, or `null` for a shape we refuse.
 *
 * A bare string is one reason. That is declared rather than left to coercion, because
 * coercion cannot make this distinction: it turns a number into its digits just as happily
 * as it turns a word into a one-item list. A matcher's interface always sends a list; the
 * string form is for a hand-written request, where the meaning is unambiguous.
 */
function readReasons(value: unknown): readonly string[] | null {
  if (value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return null;
  }

  return value as readonly string[];
}

/** A note, `undefined` when absent, and `null` when it cannot be kept. */
function readNote(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    return undefined;
  }

  return trimmed.length <= MAX_NOTE_LENGTH ? trimmed : null;
}
