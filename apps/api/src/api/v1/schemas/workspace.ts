import { therapistSchema, type RecommendationResponse } from './recommendation.js';

/**
 * Response schemas for the internal matching workspace.
 *
 * ## Every schema here is `additionalProperties: false`, and here that is load-bearing
 * twice over
 *
 * Once because a field added on the service side should fail the API's own tests rather
 * than quietly reaching a browser, which is true of every response in this project.
 *
 * Twice because of what these endpoints are for. This is a reviewer's view, and the
 * reviewer's whole claim is that they are seeing what the engine actually produced. A
 * schema that passed a field through because nobody had excluded it would put a figure on
 * the page that nothing had sanctioned — and the first thing to appear in an unexcluded
 * response is a score. So the absence is enforced here, per field, and a test reads the
 * serialised body rather than the TypeScript type.
 *
 * ## What is in these responses and what is not
 *
 * Present: what the client asked for, who the engine suggested, the evidence for that,
 * a small set of other candidates with their evidence, and what a matcher decided.
 *
 * Absent, and each absence deliberate:
 *
 * - **No score, no percentage, no rank, no weight.** The engine's internal figure decides
 *   an order and then disappears. A reviewer's case for disagreeing is *evidence*, and a
 *   number is not evidence — it is an oracle they would learn to defer to, which is the
 *   failure this whole phase is about.
 * - **No client identifier beyond the case.** A case is identified by its match, and a
 *   client is a UUID with no name attached. A reviewer sees answers, not a person.
 * - **No clinical anything.** No diagnosis, no severity, no risk, no personality. There is
 *   nothing here to store such a thing in.
 * - **No free text unless it was asked for.** `clientsWords` is absent from the case
 *   payload and lives behind a second request, so reaching for someone's own words is a
 *   visible act rather than a field that happened to be populated.
 */

const namedNeedSchema = {
  type: 'object',
  properties: {
    /** The stored key. The truth, where a name is only the wording for it. */
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

const sharedReasonSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    sentence: { type: 'string' },
  },
  required: ['key', 'sentence'],
  additionalProperties: false,
} as const;

const notOfferedSchema = {
  type: 'object',
  properties: {
    category: { type: 'string' },
    names: { type: 'array', items: { type: 'string' } },
  },
  required: ['category', 'names'],
  additionalProperties: false,
} as const;

const decisionProperties = {
  properties: {
    id: { type: 'string' },
    /** The case that was reviewed. */
    matchId: { type: 'string' },
    /** The candidate chosen. Equal to `matchId` when the suggestion was kept. */
    selectedMatchId: { type: 'string' },
    decisionType: { type: 'string', enum: ['SYSTEM_ACCEPTED', 'HUMAN_SELECTED_ALTERNATIVE'] },
    reasonKeys: { type: 'array', items: { type: 'string' } },
    /**
     * The matcher's own words.
     *
     * In an internal response, and reachable nowhere a client can see it. It is never
     * logged, and no client-facing schema has a field it could travel in.
     */
    note: { type: ['string', 'null'] },
    recordedAt: { type: 'string' },
  },
  required: [
    'id',
    'matchId',
    'selectedMatchId',
    'decisionType',
    'reasonKeys',
    'note',
    'recordedAt',
  ],
  additionalProperties: false,
} as const;

/**
 * A decision, or nothing.
 *
 * The union of *types* with the properties spread in, not `anyOf: [object, null]`. See the
 * note at the foot of this file: the obvious spelling compiles for validation and then
 * throws when `fast-json-stringify` tries to serialise a response that actually carries the
 * value.
 */
const nullableDecisionSchema = { type: ['object', 'null'], ...decisionProperties } as const;

const journeyStepSchema = {
  type: 'object',
  properties: {
    attempt: { type: 'integer' },
    matchId: { type: 'string' },
    systemSuggestedName: { type: 'string' },
    /** Reason keys the client gave about this pass. Keys, so they trace to a rule. */
    clientFeedback: { type: 'array', items: { type: 'string' } },
    decision: nullableDecisionSchema,
    selectedName: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['ELIGIBLE', 'INELIGIBLE', 'RECOMMENDED', 'DECLINED'] },
  },
  required: [
    'attempt',
    'matchId',
    'systemSuggestedName',
    'clientFeedback',
    'decision',
    'selectedName',
    'status',
  ],
  additionalProperties: false,
} as const;

/*
 * A note on the two nullable objects in this file, written because getting it wrong is
 * invisible until a response that exercises it is actually sent.
 *
 * `anyOf: [someObject, { type: 'null' }]` is the obvious way to spell "an object or null",
 * and it is what the other schemas here use for scalars. It does not work for objects:
 * `fast-json-stringify` compiles the response schema, and it cannot handle the union — it
 * throws at serialisation time, so a route whose first response happened to include the
 * nullable value returned 500 while the same route returned 200 for every response before
 * it. A nullable object is a union of *types* with the object's properties spread in.
 */

const caseSummarySchema = {
  type: 'object',
  properties: {
    /** The case's identity: the pass's recommended match. */
    matchId: { type: 'string' },
    intakeId: { type: 'string' },
    attempt: { type: 'integer' },
    /** A short line a queue is scanned by. Never every answer. */
    primaryNeeds: { type: 'array', items: { type: 'string' } },
    systemSuggestedName: { type: 'string' },
    status: { type: 'string', enum: ['NEEDS_REVIEW', 'DECIDED'] },
    hasHistory: { type: 'boolean' },
  },
  required: [
    'matchId',
    'intakeId',
    'attempt',
    'primaryNeeds',
    'systemSuggestedName',
    'status',
    'hasHistory',
  ],
  additionalProperties: false,
} as const;

const candidateSchema = {
  type: 'object',
  properties: {
    matchId: { type: 'string' },
    therapist: therapistSchema,
    /** Whether the engine could show them at all. Only eligible candidates can be chosen. */
    eligible: { type: 'boolean' },
    /** Why the engine set them aside, as a key. Absent means eligible. */
    rejectionCode: { type: ['string', 'null'] },
    shared: { type: 'array', items: sharedReasonSchema },
    notOffered: { type: 'array', items: notOfferedSchema },
  },
  required: ['matchId', 'therapist', 'eligible', 'rejectionCode', 'shared', 'notOffered'],
  additionalProperties: false,
} as const;

const needsSchema = {
  type: 'object',
  properties: {
    areasOfWork: { type: 'array', items: namedNeedSchema },
    communicationStyles: { type: 'array', items: namedNeedSchema },
    approaches: { type: 'array', items: namedNeedSchema },
    contextualExperiences: { type: 'array', items: namedNeedSchema },
    languages: { type: 'array', items: namedNeedSchema },
    sessionFormats: { type: 'array', items: namedNeedSchema },
    availability: {
      type: ['object', 'null'],
      properties: {
        timezone: { type: 'string' },
        windows: { type: 'array', items: windowSchema },
      },
      required: ['timezone', 'windows'],
      additionalProperties: false,
    },
    /**
     * The client said they were not yet sure about a conversation style.
     *
     * Sent because it changes what a reviewer should read: there is no style preference to
     * weigh, and a candidate's style is not a gap when nobody asked for one.
     */
    openToGuidance: { type: 'boolean' },
    /** The client insisted on something, which is what makes it a requirement. */
    markedAsRequirements: { type: 'boolean' },
  },
  required: [
    'areasOfWork',
    'communicationStyles',
    'approaches',
    'contextualExperiences',
    'languages',
    'sessionFormats',
    'availability',
    'openToGuidance',
    'markedAsRequirements',
  ],
  additionalProperties: false,
} as const;

const decisionReasonSchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['key', 'name', 'description'],
  additionalProperties: false,
} as const;

/** `GET /api/v1/matching-workspace/cases` */
export const caseListSchema = {
  type: 'object',
  properties: { cases: { type: 'array', items: caseSummarySchema } },
  required: ['cases'],
  additionalProperties: false,
} as const;

/** `GET /api/v1/matching-workspace/cases/:matchId` */
export const caseDetailSchema = {
  type: 'object',
  properties: {
    summary: caseSummarySchema,
    needs: needsSchema,
    suggestion: candidateSchema,
    alternatives: { type: 'array', items: candidateSchema },
    /** Exactly what may be chosen. The server validates against this same set. */
    selectableMatchIds: { type: 'array', items: { type: 'string' } },
    decisionReasons: { type: 'array', items: decisionReasonSchema },
    journey: { type: 'array', items: journeyStepSchema },
    decision: nullableDecisionSchema,
    /**
     * Absent unless the request asked for it. `null` and absent mean the same thing here
     * on purpose: a matcher should never have to tell "withheld" from "there wasn't any".
     */
    clientsWords: {
      type: ['object', 'null'],
      properties: {
        intakeNote: { type: ['string', 'null'] },
        feedbackNotes: {
          type: 'array',
          items: {
            type: 'object',
            properties: { attempt: { type: 'integer' }, note: { type: 'string' } },
            required: ['attempt', 'note'],
            additionalProperties: false,
          },
        },
      },
      required: ['intakeNote', 'feedbackNotes'],
      additionalProperties: false,
    },
  },
  required: [
    'summary',
    'needs',
    'suggestion',
    'alternatives',
    'selectableMatchIds',
    'decisionReasons',
    'journey',
    'decision',
    'clientsWords',
  ],
  additionalProperties: false,
} as const;

/** `GET /api/v1/matching-workspace/cases/:matchId/clients-words` */
export const clientsWordsSchema = {
  type: 'object',
  properties: {
    intakeNote: { type: ['string', 'null'] },
    feedbackNotes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { attempt: { type: 'integer' }, note: { type: 'string' } },
        required: ['attempt', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['intakeNote', 'feedbackNotes'],
  additionalProperties: false,
} as const;

/** `POST /api/v1/matching-workspace/cases/:matchId/decision` */
export const decisionResultSchema = {
  type: 'object',
  properties: {
    decisionType: { type: 'string', enum: ['SYSTEM_ACCEPTED', 'HUMAN_SELECTED_ALTERNATIVE'] },
    selectedMatchId: { type: 'string' },
    selectedTherapistName: { type: 'string' },
    /**
     * Who the engine suggested, so the interface can show the difference at once rather
     * than asking a matcher to hold two names in their head after a decision.
     */
    systemSuggestedName: { type: 'string' },
    differs: { type: 'boolean' },
    recordedAt: { type: 'string' },
  },
  required: [
    'decisionType',
    'selectedMatchId',
    'selectedTherapistName',
    'systemSuggestedName',
    'differs',
    'recordedAt',
  ],
  additionalProperties: false,
} as const;

export interface CaseSummaryResponse {
  readonly matchId: string;
  readonly intakeId: string;
  readonly attempt: number;
  readonly primaryNeeds: readonly string[];
  readonly systemSuggestedName: string;
  readonly status: 'NEEDS_REVIEW' | 'DECIDED';
  readonly hasHistory: boolean;
}

export interface NamedNeedResponse {
  readonly key: string;
  readonly name: string;
}

export interface SharedReasonResponse {
  readonly key: string;
  readonly sentence: string;
}

export interface NotOfferedResponse {
  readonly category: string;
  readonly names: readonly string[];
}

export interface DecisionResponse {
  readonly id: string;
  readonly matchId: string;
  readonly selectedMatchId: string;
  readonly decisionType: 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';
  readonly reasonKeys: readonly string[];
  readonly note: string | null;
  readonly recordedAt: string;
}

export interface CandidateResponse {
  readonly matchId: string;
  readonly therapist: RecommendationResponse['therapist'];
  readonly eligible: boolean;
  readonly rejectionCode: string | null;
  readonly shared: readonly SharedReasonResponse[];
  readonly notOffered: readonly NotOfferedResponse[];
}

export interface CaseDetailResponse {
  readonly summary: CaseSummaryResponse;
  readonly needs: {
    readonly areasOfWork: readonly NamedNeedResponse[];
    readonly communicationStyles: readonly NamedNeedResponse[];
    readonly approaches: readonly NamedNeedResponse[];
    readonly contextualExperiences: readonly NamedNeedResponse[];
    readonly languages: readonly NamedNeedResponse[];
    readonly sessionFormats: readonly NamedNeedResponse[];
    readonly availability: {
      readonly timezone: string;
      readonly windows: readonly {
        readonly dayOfWeek: string;
        readonly startMinute: number;
        readonly endMinute: number;
      }[];
    } | null;
    readonly openToGuidance: boolean;
    readonly markedAsRequirements: boolean;
  };
  readonly suggestion: CandidateResponse;
  readonly alternatives: readonly CandidateResponse[];
  readonly selectableMatchIds: readonly string[];
  readonly decisionReasons: readonly {
    readonly key: string;
    readonly name: string;
    readonly description: string;
  }[];
  readonly journey: readonly {
    readonly attempt: number;
    readonly matchId: string;
    readonly systemSuggestedName: string;
    readonly clientFeedback: readonly string[];
    readonly decision: DecisionResponse | null;
    readonly selectedName: string | null;
    readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
  }[];
  readonly decision: DecisionResponse | null;
  readonly clientsWords: {
    readonly intakeNote: string | null;
    readonly feedbackNotes: readonly { readonly attempt: number; readonly note: string }[];
  } | null;
}

export interface DecisionResultResponse {
  readonly decisionType: 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';
  readonly selectedMatchId: string;
  readonly selectedTherapistName: string;
  readonly systemSuggestedName: string;
  readonly differs: boolean;
  readonly recordedAt: string;
}
