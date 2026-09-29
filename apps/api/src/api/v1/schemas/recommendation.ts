/**
 * The shape of one recommendation.
 *
 * Extracted from both the first-match and the rematch schemas because they are the same
 * thing. A first match is a rematch with an empty exclusion set and no feedback, and
 * saying that in the type system — one schema, two endpoints — is what keeps a page from
 * having to work out which response it got and then render nothing because it guessed
 * wrong.
 *
 * ## What is deliberately absent
 *
 * No score. No rank. No percentage. No weights. No engine version. No rejection codes.
 * No list of anyone else. No client, intake or therapist identifier beyond the one the
 * profile link needs.
 *
 * Every schema here is `additionalProperties: false`, and that is load-bearing rather
 * than tidiness: a field added on the service side is rejected by this schema, so it
 * fails the API's own tests instead of quietly reaching a browser. A product that
 * argues against being a marketplace should make that structurally true rather than a
 * matter of remembering.
 *
 * Two fields are the opposite of a score and are easy to mistake for one, so they are
 * called out here: `attempt` counts which pass this is, and `considered` counts people.
 * Neither is derived from how well anyone matched, neither is compared to anything, and
 * neither appears in a sentence a client reads as a judgement.
 */

export const attributeSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
  },
  required: ['key', 'name'],
  additionalProperties: false,
} as const;

export const windowSchema = {
  type: 'object',
  properties: {
    dayOfWeek: { type: 'string' },
    startMinute: { type: 'integer' },
    endMinute: { type: 'integer' },
  },
  required: ['dayOfWeek', 'startMinute', 'endMinute'],
  additionalProperties: false,
} as const;

export const therapistSchema = {
  type: 'object',
  properties: {
    // Present because the profile page needs it to link, and because the profile
    // endpoint is already public. It is a link, not a ranking.
    id: { type: 'string' },
    displayName: { type: 'string' },
    headline: { type: 'string' },
    bio: { type: 'string' },
    location: { type: 'string' },
    timezone: { type: 'string' },
    yearsOfExperience: { type: 'integer' },
    languages: { type: 'array', items: attributeSchema },
    areasOfWork: { type: 'array', items: attributeSchema },
    communicationStyles: { type: 'array', items: attributeSchema },
    approaches: { type: 'array', items: attributeSchema },
    contextualExperience: { type: 'array', items: attributeSchema },
    sessionFormats: { type: 'array', items: attributeSchema },
    availability: { type: 'array', items: windowSchema },
  },
  required: [
    'id',
    'displayName',
    'headline',
    'bio',
    'location',
    'timezone',
    'yearsOfExperience',
    'languages',
    'areasOfWork',
    'communicationStyles',
    'approaches',
    'contextualExperience',
    'sessionFormats',
    'availability',
  ],
  additionalProperties: false,
} as const;

/** One reason, as a sentence, with the key it came from so a client can trace it. */
export const matchReasonSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    sentence: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['key', 'sentence', 'detail'],
  additionalProperties: false,
} as const;

/**
 * One difference between two recommendations.
 *
 * `category` is the stable key for the attribute family, so a client can tell which
 * thing a note is about. It is never a score, a weight, or a comparison of numbers —
 * and `whatChanged.ts` has a test that reads every sentence it can produce and fails if
 * one contains a digit beside a comparative.
 */
export const changeNoteSchema = {
  type: 'object',
  properties: {
    category: { type: 'string' },
    sentence: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['category', 'sentence', 'detail'],
  additionalProperties: false,
} as const;

/**
 * A recommendation, as a client sees it.
 *
 * The same schema for a first match and for a rematch, and every field is present in
 * both. `attempt` is 1 on a first match. `previousTherapistName` is `null` and
 * `whatChanged` is empty — the honest answers when there is nothing to compare against,
 * rather than missing fields a page would have to detect.
 */
export const recommendationSchema = {
  type: 'object',
  properties: {
    /** The stored decision's id, so a client can act on this exact one. */
    matchId: { type: 'string' },
    /** ISO 8601, taken from the stored row rather than from a fresh clock reading. */
    decidedAt: { type: 'string' },
    /**
     * Which pass this is. 1 for a first match, and one more for each rematch.
     *
     * A count of searches, never of anything to do with a person.
     */
    attempt: { type: 'integer' },
    /**
     * Who the client is being moved away from, by name.
     *
     * Someone they already saw and already turned down. Null on a first match. No
     * identifier travels with it, and no other attribute of theirs.
     */
    previousTherapistName: { type: ['string', 'null'] },
    therapist: therapistSchema,
    whyThisMatch: { type: 'array', items: matchReasonSchema },
    /**
     * Up to three differences from the previous recommendation, each one a fact about a
     * stated attribute or an overlap the engine found.
     *
     * May be empty, and that is the common honest case: the server sends nothing it
     * cannot prove changed, so an empty list means exactly that.
     */
    whatChanged: { type: 'array', items: changeNoteSchema },
    /**
     * The reason keys the next search was adjusted for.
     *
     * Keys rather than labels, so each one can be traced to a rule in the source. Empty
     * on a first match, where nothing was adjusted.
     */
    adjustedFor: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'matchId',
    'decidedAt',
    'attempt',
    'previousTherapistName',
    'therapist',
    'whyThisMatch',
    'whatChanged',
    'adjustedFor',
  ],
  additionalProperties: false,
} as const;

export interface RecommendationResponse {
  readonly matchId: string;
  readonly decidedAt: string;
  readonly attempt: number;
  readonly previousTherapistName: string | null;
  readonly therapist: {
    readonly id: string;
    readonly displayName: string;
    readonly headline: string;
    readonly bio: string;
    readonly location: string;
    readonly timezone: string;
    readonly yearsOfExperience: number;
    readonly languages: readonly { key: string; name: string }[];
    readonly areasOfWork: readonly { key: string; name: string }[];
    readonly communicationStyles: readonly { key: string; name: string }[];
    readonly approaches: readonly { key: string; name: string }[];
    readonly contextualExperience: readonly { key: string; name: string }[];
    readonly sessionFormats: readonly { key: string; name: string }[];
    readonly availability: readonly {
      dayOfWeek: string;
      startMinute: number;
      endMinute: number;
    }[];
  };
  readonly whyThisMatch: readonly { key: string; sentence: string; detail: string }[];
  readonly whatChanged: readonly { category: string; sentence: string; detail: string }[];
  readonly adjustedFor: readonly string[];
}

/** Nothing qualified: a `200` with an outcome, because nobody asked for a missing resource. */
export const noCandidateSchema = {
  type: 'object',
  properties: {
    outcome: { type: 'string' },
    /**
     * How many people were considered.
     *
     * A count of people, never a count of score, and the whole explanation: there was
     * nobody else left who met the conditions.
     */
    considered: { type: 'integer' },
  },
  required: ['outcome', 'considered'],
  additionalProperties: false,
} as const;

export interface NoCandidateResponse {
  readonly outcome: 'no_candidate';
  readonly considered: number;
}
