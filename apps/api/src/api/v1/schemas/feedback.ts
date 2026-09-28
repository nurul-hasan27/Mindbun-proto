/**
 * Response schemas for feedback and rematching.
 *
 * The recommendation body is *not* re-declared here. It is the same shape the match
 * endpoint returns, it is shared, and duplicating it would be the first place the two
 * endpoints could start to disagree about what a recommendation is.
 *
 * What is deliberately absent is the same list as for a first match, plus more: no
 * score, no rank, no percentage, no weight, no other candidate, no exclusion list, no
 * engine version, and no client or intake identifier. Every schema here is declared
 * `additionalProperties: false`, so a field added on this side fails the API's own
 * tests rather than quietly reaching a browser.
 */
import { noCandidateSchema, recommendationSchema } from './recommendation.js';

const feedbackReasonSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['key', 'name', 'description'],
  additionalProperties: false,
} as const;

/**
 * `GET /api/v1/feedback/reasons`
 *
 * The terms on offer, read from the database rather than written into a client.
 *
 * That is the whole point: `key` is what the engine matches on and `name` is what a
 * person reads, so the two are allowed to diverge — a copywriter rewrites the wording
 * without touching a single rule. A client with the words hardcoded would need a code
 * change to change a sentence, and would be free to drift from the vocabulary the
 * server actually has.
 */
export const feedbackReasonsSchema = {
  type: 'object',
  properties: {
    reasons: { type: 'array', items: feedbackReasonSchema },
  },
  required: ['reasons'],
  additionalProperties: false,
} as const;

export interface FeedbackReasonResponse {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

/** `201 POST /api/v1/matches/:matchId/feedback` */
export const feedbackReceiptSchema = {
  type: 'object',
  properties: {
    feedbackId: { type: 'string' },
    matchId: { type: 'string' },
    /** The reason keys, sorted. Not labels: labels are the interface's business. */
    reasons: { type: 'array', items: { type: 'string' } },
    recordedAt: { type: 'string' },
  },
  required: ['feedbackId', 'matchId', 'reasons', 'recordedAt'],
  additionalProperties: false,
} as const;

export interface FeedbackReceiptResponse {
  readonly feedbackId: string;
  readonly matchId: string;
  readonly reasons: readonly string[];
  readonly recordedAt: string;
}

/**
 * `200 POST /api/v1/matches/:matchId/rematch`
 *
 * The shared recommendation schema, or an honest "nobody left".
 *
 * The exhausted case is a `200` with `{ outcome, considered }` rather than a `404`:
 * the person asked a question, and "there is nobody else" is the answer to it. A `404`
 * would invite the page to say "not found", which is a claim about a system rather than
 * a statement about the pool.
 */
export const rematchResponseSchema = {
  oneOf: [recommendationSchema, noCandidateSchema],
} as const;

export type { RecommendationResponse, NoCandidateResponse } from './recommendation.js';
