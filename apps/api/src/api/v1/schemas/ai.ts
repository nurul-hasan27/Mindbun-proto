/**
 * Schemas for the AI routes.
 *
 * ## Every one is `additionalProperties: false`, and the request ones are the load-bearing case
 *
 * On a response that is the usual rule of this project: a field added on the service side
 * should fail the API's own tests rather than reach a browser. On a request it is a control
 * rather than a convention — these bodies are a person's own words, and an endpoint that
 * silently accepted a field called `therapistId` or `clientId` would be an endpoint a caller
 * could steer with.
 *
 * `POST /ai/match-summary` takes **only** a `matchId`. The server loads the case, builds the
 * context and calls the provider, so there is no field through which a browser could name a
 * therapist, a client, an intake, or a piece of text to summarise. That is the structural
 * half of "the AI cannot select a therapist" — the other half being that the provider's
 * output type has nowhere to put one.
 *
 * ## Markup never travels
 *
 * A response is a string; the interface renders it as a text node. There is no `html` field,
 * no `markdown` field, and no way for a provider to return something the page will parse.
 */

const confidenceSchema = { type: 'string', enum: ['low', 'medium', 'high'] } as const;

/**
 * Where a kept suggestion would go.
 *
 * Server-decided and sent to the browser, so the interface does not have to reimplement the
 * mapping and cannot disagree with the validator about which key belongs in which question.
 */
const targetSchema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['draft', 'guidance', 'availabilityHint', 'note-only'],
    },
    /** Only on `draft`. One of the five vocabulary families in the intake. */
    field: { type: 'string' },
    /** Only on `availabilityHint`. */
    part: { type: ['string', 'null'] },
    /** Only on `availabilityHint`. */
    days: { type: 'array', items: { type: 'string' } },
    /** The human wording, in the product's own vocabulary. */
    label: { type: 'string' },
  },
  required: ['kind', 'label'],
  additionalProperties: false,
} as const;

const signalSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: [
        'area',
        'approach',
        'communicationStyle',
        'context',
        'language',
        'sessionFormat',
        'availability',
        'guidance',
      ],
    },
    key: { type: 'string' },
    confidence: confidenceSchema,
    /** One value by construction. See `AiSignalSource`. */
    source: { type: 'string', enum: ['user_message'] },
    explanation: { type: 'string' },
    target: targetSchema,
  },
  required: ['category', 'key', 'confidence', 'source', 'explanation', 'target'],
  additionalProperties: false,
} as const;

const messageSchema = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ['assistant', 'user'] },
    text: { type: 'string' },
  },
  required: ['role', 'text'],
  additionalProperties: false,
} as const;

export const aiTurnRequestSchema = {
  type: 'object',
  properties: {
    messages: { type: 'array', items: messageSchema, maxItems: 40 },
    /** What the intake already holds, so the assistant does not re-ask. */
    known: {
      type: 'object',
      properties: {
        areasOfWork: { type: 'array', items: { type: 'string' } },
        communicationStyles: { type: 'array', items: { type: 'string' } },
        openToGuidance: { type: 'boolean' },
        contextualExperience: { type: 'array', items: { type: 'string' } },
        languages: { type: 'array', items: { type: 'string' } },
        sessionFormats: { type: 'array', items: { type: 'string' } },
        hasAvailability: { type: 'boolean' },
        hasFreeText: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  required: ['messages', 'known'],
  additionalProperties: false,
} as const;

export const aiExtractRequestSchema = {
  type: 'object',
  properties: {
    messages: { type: 'array', items: messageSchema, maxItems: 40 },
  },
  required: ['messages'],
  additionalProperties: false,
} as const;

export const aiMatchSummaryRequestSchema = {
  type: 'object',
  properties: {
    matchId: { type: 'string', format: 'uuid' },
  },
  required: ['matchId'],
  additionalProperties: false,
} as const;

export const aiTurnResponseSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    readyToSummarise: { type: 'boolean' },
    /** Which implementation answered. Shown to the person, and useful in a bug report. */
    provider: { type: 'string' },
  },
  required: ['reply', 'readyToSummarise', 'provider'],
  additionalProperties: false,
} as const;

export const aiExtractResponseSchema = {
  type: 'object',
  properties: {
    signals: { type: 'array', items: signalSchema },
    /**
     * What was said that could not be placed.
     *
     * Reported rather than dropped in silence: an assistant that quietly discarded a
     * preference is lying by omission, and "I could not place *integrative* — the intake
     * has no question about approaches" is a true thing to be told.
     */
    notUnderstood: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string' }, key: { type: 'string' } },
        required: ['category', 'key'],
        additionalProperties: false,
      },
    },
    /**
     * Suggestions that were understood but did not fit the list.
     *
     * A separate claim from `notUnderstood`, and a separate field so the interface can be
     * honest about which is which: "I could not place that" and "there was more than I
     * could show you" are different sentences about different things.
     */
    surplus: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string' }, key: { type: 'string' } },
        required: ['category', 'key'],
        additionalProperties: false,
      },
    },
    provider: { type: 'string' },
  },
  required: ['signals', 'notUnderstood', 'surplus', 'provider'],
  additionalProperties: false,
} as const;

export const aiMatchSummaryResponseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    tradeoffs: { type: 'array', items: { type: 'string' } },
    provider: { type: 'string' },
  },
  required: ['summary', 'observations', 'tradeoffs', 'provider'],
  additionalProperties: false,
} as const;

export interface AiTurnResponse {
  readonly reply: string;
  readonly readyToSummarise: boolean;
  readonly provider: string;
}

export interface AiExtractResponse {
  readonly signals: readonly unknown[];
  readonly notUnderstood: readonly { readonly category: string; readonly key: string }[];
  readonly surplus: readonly { readonly category: string; readonly key: string }[];
  readonly provider: string;
}

export interface AiMatchSummaryResponse {
  readonly summary: string;
  readonly observations: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly provider: string;
}
