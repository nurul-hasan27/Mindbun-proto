/**
 * Response schemas for the intake API.
 *
 * As with therapists, these are the contract: Fastify validates and serialises
 * every response from them, so a mistake in the repository shows up as a failed
 * test rather than as a surprise in the client's types.
 *
 * The *request* is deliberately not a JSON Schema. See
 * `data/intake/intakeValidation.ts` for why, and the shared error shape below.
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

const languageSchema = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
  },
  required: ['code', 'name'],
  additionalProperties: false,
} as const;

export const intakeVocabularyResponseSchema = {
  type: 'object',
  properties: {
    areasOfWork: { type: 'array', items: attributeSchema },
    communicationStyles: { type: 'array', items: attributeSchema },
    contextualExperience: { type: 'array', items: attributeSchema },
    languages: { type: 'array', items: languageSchema },
    sessionFormats: { type: 'array', items: attributeSchema },
  },
  required: [
    'areasOfWork',
    'communicationStyles',
    'contextualExperience',
    'languages',
    'sessionFormats',
  ],
  additionalProperties: false,
} as const;

export const intakeReceiptSchema = {
  type: 'object',
  properties: {
    intakeId: { type: 'string', format: 'uuid' },
    receivedAt: { type: 'string' },
  },
  required: ['intakeId', 'receivedAt'],
  additionalProperties: false,
} as const;

export interface IntakeVocabularyResponse {
  readonly areasOfWork: readonly { key: string; name: string }[];
  readonly communicationStyles: readonly { key: string; name: string }[];
  readonly contextualExperience: readonly { key: string; name: string }[];
  readonly languages: readonly { code: string; name: string }[];
  readonly sessionFormats: readonly { key: string; name: string }[];
}

export interface IntakeReceiptResponse {
  readonly intakeId: string;
  readonly receivedAt: string;
}
