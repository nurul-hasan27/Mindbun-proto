/**
 * Response schemas for the matching API.
 *
 * As with therapists and intake, these *are* the contract: Fastify validates and
 * serialises every response from them, so a mistake in the repository shows up as a
 * failed test rather than as a field a client learns to depend on.
 *
 * The important property is what is **absent**. The response has no score, no rank,
 * no list of other candidates, no weights, no engine version and no rejection codes.
 * Declaring them here as "additionalProperties: false" means that if a future change
 * ever adds one, this schema fails rather than the field quietly reaching a browser.
 * A product that argues against being a marketplace should make that structurally
 * true rather than a matter of remembering.
 */

const attributeSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
  },
  required: ['key', 'name'],
  additionalProperties: false,
} as const;

const windowSchema = {
  type: 'object',
  properties: {
    dayOfWeek: { type: 'string' },
    startMinute: { type: 'integer' },
    endMinute: { type: 'integer' },
  },
  required: ['dayOfWeek', 'startMinute', 'endMinute'],
  additionalProperties: false,
} as const;

const therapistSchema = {
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

const reasonSchema = {
  type: 'object',
  properties: {
    /** The machine key the sentence came from, so a client can trace it. */
    key: { type: 'string' },
    sentence: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['key', 'sentence', 'detail'],
  additionalProperties: false,
} as const;

export const matchResponseSchema = {
  type: 'object',
  properties: {
    /** The stored decision's id, so a client can ask about this exact one. */
    matchId: { type: 'string' },
    /** ISO 8601, taken from the stored row rather than from a fresh clock reading. */
    decidedAt: { type: 'string' },
    therapist: therapistSchema,
    whyThisMatch: { type: 'array', items: reasonSchema },
  },
  required: ['matchId', 'decidedAt', 'therapist', 'whyThisMatch'],
  additionalProperties: false,
} as const;

/**
 * Nothing qualified.
 *
 * A `200` rather than a `404`: nobody asked for a resource that is missing, they
 * asked a question and the answer is "not yet, and here is why". The frontend turns
 * this into the sentence about loosening a requirement, and a `404` would invite it
 * to say "no therapist found" instead.
 */
export const noCandidateResponseSchema = {
  type: 'object',
  properties: {
    outcome: { type: 'string' },
    /** How many were considered. A fact, not a score. */
    considered: { type: 'integer' },
  },
  required: ['outcome', 'considered'],
  additionalProperties: false,
} as const;

export interface MatchResponse {
  readonly matchId: string;
  readonly decidedAt: string;
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
}

export interface NoCandidateResponse {
  readonly outcome: 'no_candidate';
  readonly considered: number;
}
