/**
 * The AI provider port — the only place in the application that knows an AI exists.
 *
 * ## The one rule this file exists to protect
 *
 * **An LLM may interpret language and summarise information. It may never decide anything.**
 *
 * That is not a convention the rest of the codebase is trusted to observe. It is a property
 * of these types. Look at what a provider is *able* to return:
 *
 * - `AiSignal` carries a category, a key, a confidence, a source and a sentence of
 *   explanation. There is no field for a therapist, a match, a score, a rank, or a
 *   requirement. A provider physically cannot name a person, because the shape it fills in
 *   has nowhere to put one.
 * - `AiCaseSummary` carries prose. The `matchId` it describes is supplied by the caller
 *   from our side, and every fact in the summary is checked against stored evidence before
 *   it is rendered.
 *
 * The deterministic engine remains the source of truth for eligibility, requirements,
 * preferences, availability, scoring, ordering, selection, evidence, rematching and
 * exclusions. None of that is reachable from here, and adding a field that reached it would
 * be visible in review because it would have to appear in this file.
 *
 * ## Why an interface and not a direct SDK call
 *
 * Three reasons, in the order they bit:
 *
 * 1. **The product must work without a key.** A prototype that is unusable unless someone
 *    has an account is a prototype nobody can review. `mockAiProvider` is a real
 *    implementation, not a stub, so the whole flow is demonstrable offline and in CI.
 * 2. **The tests must not call a network.** A deterministic fake is the only way to assert
 *    on malformed output, on timeouts, and on a provider that returns nonsense.
 * 3. **Swapping providers should not touch the application.** The port is three methods and
 *    a set of value types; anything satisfying it can be configured in.
 */

/** Who is speaking. Deliberately only these three — see `AiMessage`. */
export type AiRole = 'assistant' | 'user';

/**
 * One turn of the conversation, as the provider sees it.
 *
 * A string rather than a provider SDK's message type, so the port has no dependency and the
 * mock is a pure function of this array.
 */
export interface AiMessage {
  readonly role: AiRole;
  /**
   * The person's own words.
   *
   * Treated as sensitive everywhere it goes: never logged, never stored, never echoed into
   * an error. It reaches a provider and nowhere else.
   */
  readonly text: string;
}

/**
 * What the intake already knows.
 *
 * Sent with every turn so the assistant can avoid asking a question that has been answered,
 * which is the single most tiring thing a intake form can do to someone. A `known` entry
 * whose value is an empty array means "asked, nothing chosen" and is different from an absent
 * key, which means "not reached yet".
 */
export interface AiKnownAnswers {
  readonly areasOfWork?: readonly string[];
  readonly communicationStyles?: readonly string[];
  readonly openToGuidance?: boolean;
  readonly contextualExperience?: readonly string[];
  readonly languages?: readonly string[];
  readonly sessionFormats?: readonly string[];
  readonly hasAvailability?: boolean;
  readonly hasFreeText?: boolean;
}

/** The families a suggestion may belong to. Maps onto the existing vocabularies, one for one. */
export const SIGNAL_CATEGORIES = [
  'area',
  'approach',
  'communicationStyle',
  'context',
  'language',
  'sessionFormat',
  'availability',
  'guidance',
] as const;

export type AiSignalCategory = (typeof SIGNAL_CATEGORIES)[number];

/**
 * How sure the assistant is, and what that means.
 *
 * `low` is not a hedge. It is the honest reading of a phrase like "I've been a bit stressed
 * at work lately" — probably work and career, possibly not. Surfacing it as low confidence
 * and letting the person say no is better than either claiming it or hiding it.
 */
export type AiSignalConfidence = 'low' | 'medium' | 'high';

/**
 * Where a signal came from.
 *
 * `user_message` only. It is a one-value union on purpose: the only legitimate source of a
 * suggestion about someone's preferences is something they said. A field that could hold
 * `model_prior` or `inferred_from_location` would be a place for exactly the kind of
 * inference this product refuses to make, and leaving it one-valued makes that a type error
 * rather than a code review question.
 */
export type AiSignalSource = 'user_message';

/**
 * One structured suggestion, for a person to keep, change or reject.
 *
 * The key is a vocabulary key validated against the live database before it is ever returned
 * to a browser — see `validateSignals`. An unknown key is dropped, not stored and not sent.
 */
export interface AiSignal {
  readonly category: AiSignalCategory;
  readonly key: string;
  readonly confidence: AiSignalConfidence;
  readonly source: AiSignalSource;
  /**
   * Why this was suggested, in one sentence, addressed to the person.
   *
   * Shown beside the suggestion so it can be judged. A suggestion with no stated reason is
   * one a person cannot disagree with usefully.
   */
  readonly explanation: string;
}

/** One assistant turn. */
export interface AiTurn {
  /**
   * What the assistant says.
   *
   * Plain text. Never HTML — the interface renders it as text, and a provider returning
   * markup is a case the renderer is built not to be able to execute.
   */
  readonly reply: string;
  /**
   * Whether the assistant believes it has enough to summarise.
   *
   * The client asks for an extraction when this is true, and the person can ask for it
   * sooner. It is a hint, not a gate: being wrong in either direction produces a worse
   * conversation but never a wrong answer, because nothing here is committed to the draft.
   */
  readonly readyToSummarise: boolean;
}

/**
 * A summary of a matching case, for a human matcher.
 *
 * Prose only. Every claim in it is checked against stored evidence by
 * `assertGroundedIn` before it is returned, so a provider that invents a fact produces a
 * failed summary rather than a plausible lie.
 */
export interface AiCaseSummary {
  /** Two or three sentences on what the client appears to be looking for. */
  readonly summary: string;
  /**
   * Things worth a reviewer's attention, each traceable to a field.
   *
   * Capped and length-limited by validation, because a list of everything is not a summary.
   */
  readonly observations: readonly string[];
  /**
   * Genuine tensions in the data — a preference met by one candidate and missed by another.
   *
   * Empty is the honest and common case, and is rendered as such rather than padded.
   */
  readonly tradeoffs: readonly string[];
}

/**
 * The minimum structured context a provider is given about a case.
 *
 * ## What is deliberately absent, and it is most of what exists
 *
 * This type has no field for the intake's free text, the feedback's free text, a matcher's
 * note, a therapist's biography, a client's name, a score, or a rank. A provider cannot be
 * shown a client's own words about their life when summarising a case, because there is
 * nowhere to put them.
 *
 * That is the privacy boundary implemented rather than described, and it is why this
 * function is not given a repository.
 */
export interface AiCaseContext {
  /**
   * What the client asked for, as vocabulary keys, already named for display.
   *
   * `category` is the same short family label the workspace's own `notOffered` entries use —
   * "Work with", "Style", "Language" — so a summary reads in the same words as the page it
   * sits on rather than inventing a second vocabulary for the same thing.
   */
  readonly needs: readonly { readonly category: string; readonly label: string }[];
  /** Whether the client insisted on anything, which is what makes it a requirement. */
  readonly hasRequirements: boolean;
  /** The engine's suggestion. */
  readonly suggestion: {
    readonly name: string;
    /** Sentences generated from stored evidence. The only reasons a provider may use. */
    readonly reasons: readonly string[];
    /** Terms the client named that this candidate does not carry. */
    readonly notOffered: readonly { readonly category: string; readonly names: readonly string[] }[];
  };
  /** The other candidates, with the same fields. */
  readonly alternatives: readonly {
    readonly name: string;
    readonly reasons: readonly string[];
    readonly notOffered: readonly { readonly category: string; readonly names: readonly string[] }[];
  }[];
  /**
   * The client's structured reasons for declining earlier passes, as labels.
   *
   * There is no count of candidates the engine ruled out, and its absence is deliberate.
   * The case detail's shortlist is capped before it reaches this function, so any count
   * derived from it would be a figure about a subset dressed up as a figure about the
   * whole — and the workspace already says the same thing in words that are true, with no
   * number attached.
   */
  readonly priorFeedback: readonly string[];
}

/** Raised when a provider cannot answer. Never carries the input or a provider's raw body. */
export class AiUnavailableError extends Error {
  constructor(reason: 'unconfigured' | 'timeout' | 'network' | 'bad-response' | 'refused') {
    super(
      reason === 'refused'
        ? 'The assistant could not help with that.'
        : 'The assistant is not available right now.',
    );
    this.name = 'AiUnavailableError';
  }
}

/**
 * The port.
 *
 * Implementations must be safe to call concurrently and must never throw anything other than
 * `AiUnavailableError` for a failure a caller should handle. `available` is `false` when
 * the provider is unconfigured, so the route can offer the manual intake instead of
 * pretending a failure is temporary.
 */
export interface AiProvider {
  /** For the interface, and so a person can be told which one answered. */
  readonly name: string;
  /** Whether this provider can be called at all. */
  readonly available: boolean;
  /** One conversational turn. */
  nextTurn(messages: readonly AiMessage[], known: AiKnownAnswers): Promise<AiTurn>;
  /** The whole conversation, read as structured suggestions. */
  extractSignals(messages: readonly AiMessage[]): Promise<readonly AiSignal[]>;
  /** A case, summarised for a human matcher. */
  summariseCase(context: AiCaseContext): Promise<AiCaseSummary>;
}
