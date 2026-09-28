/**
 * Response schemas for the matching API.
 *
 * As with therapists and intake, these *are* the contract: Fastify validates and
 * serialises every response from them, so a mistake in the repository shows up as a
 * failed test rather than as a field a client learns to depend on.
 *
 * The important property is what is **absent**. The response has no score, no rank,
 * no list of other candidates, no weights, no engine version and no rejection codes.
 * Declaring them here as `additionalProperties: false` means that if a future change
 * ever adds one, this schema fails rather than the field quietly reaching a browser.
 * A product that argues against being a marketplace should make that structurally
 * true rather than a matter of remembering.
 *
 * The recommendation body itself lives in `recommendation.ts`, shared with the rematch
 * endpoint, because the two are the same thing.
 */
import { noCandidateSchema, recommendationSchema } from './recommendation.js';

/** `200 POST /api/v1/matches` — a recommendation, or an honest "not yet". */
export const matchResponseSchema = {
  oneOf: [recommendationSchema, noCandidateSchema],
} as const;

/**
 * The same recommendation schema, re-exported under the name the match route uses.
 *
 * Not an alias for its own sake: the route's tests import this name, and having it
 * point at the shared schema means a change to the recommendation's shape fails the
 * match tests as well as the rematch ones, rather than only the ones that happen to
 * test it directly.
 */
export const recommendationBodySchema = recommendationSchema;

export type { NoCandidateResponse, RecommendationResponse } from './recommendation.js';
