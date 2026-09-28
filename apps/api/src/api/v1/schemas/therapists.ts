/**
 * Response schemas for `/api/v1/therapists`.
 *
 * These are the contract. Fastify validates and serialises every response from
 * them, so a mistake in the repository shows up as a failed test rather than as
 * a surprise in the client's types.
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

const daySchema = {
  type: 'string',
  enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
} as const;

export const therapistSummarySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    displayName: { type: 'string' },
    headline: { type: 'string' },
    location: { type: 'string' },
    timezone: { type: 'string' },
    yearsOfExperience: { type: 'integer' },
    languages: { type: 'array', items: attributeSchema },
    areasOfWork: { type: 'array', items: attributeSchema },
    communicationStyles: { type: 'array', items: attributeSchema },
  },
  required: [
    'id',
    'displayName',
    'headline',
    'location',
    'timezone',
    'yearsOfExperience',
    'languages',
    'areasOfWork',
    'communicationStyles',
  ],
  additionalProperties: false,
} as const;

export const therapistProfileSchema = {
  ...therapistSummarySchema,
  properties: {
    ...therapistSummarySchema.properties,
    bio: { type: 'string' },
    approaches: { type: 'array', items: attributeSchema },
    contextualExperience: { type: 'array', items: attributeSchema },
    sessionFormats: { type: 'array', items: attributeSchema },
    availability: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dayOfWeek: daySchema,
          startMinute: { type: 'integer', minimum: 0, maximum: 1440 },
          endMinute: { type: 'integer', minimum: 0, maximum: 1440 },
        },
        required: ['dayOfWeek', 'startMinute', 'endMinute'],
        additionalProperties: false,
      },
    },
  },
  required: [
    ...therapistSummarySchema.required,
    'bio',
    'approaches',
    'contextualExperience',
    'sessionFormats',
    'availability',
  ],
} as const;

export const therapistListResponseSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: therapistSummarySchema },
    pagination: {
      type: 'object',
      properties: {
        total: { type: 'integer', minimum: 0 },
        take: { type: 'integer', minimum: 1 },
        skip: { type: 'integer', minimum: 0 },
        hasMore: { type: 'boolean' },
      },
      required: ['total', 'take', 'skip', 'hasMore'],
      additionalProperties: false,
    },
  },
  required: ['items', 'pagination'],
  additionalProperties: false,
} as const;

/** One error shape for the whole application API. */
export const errorResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['statusCode', 'error', 'message'],
  additionalProperties: false,
} as const;

export interface TherapistListResponse {
  items: unknown[];
  pagination: { total: number; take: number; skip: number; hasMore: boolean };
}

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}
