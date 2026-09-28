import { API_V1 } from './version';
import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';
import type { DayName } from './types';

/**
 * The client's side of the AI layer.
 *
 * ## What this module can and cannot do
 *
 * It sends a conversation and receives vocabulary keys. It **cannot write anything**: there
 * is no function here that stores a suggestion, and no endpoint behind one that would accept
 * one. Applying a suggestion is the interface's job, on a page where the person can see and
 * undo every one — which is why keeping it here is not merely a scoping decision.
 *
 * ## No secret, ever
 *
 * The key lives in the server's environment. Nothing in this file reads configuration, and
 * no request here carries a credential. `AI_API_KEY` is not prefixed `VITE_`, so it is not in
 * the bundle; a test in `ai.test.ts` asserts that the string does not appear in the built
 * output.
 *
 * ## Nothing is logged
 *
 * The transcript is someone's own words. No `console`, no telemetry, no error detail that
 * includes it. The `ApiError` messages below are written to be shown to a person, so a
 * failure never carries the request body either.
 */

export type AiRole = 'assistant' | 'user';

export interface AiMessage {
  readonly role: AiRole;
  readonly text: string;
}

/** What the intake already holds, so the assistant does not ask an answered question. */
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

export type AiSignalCategory =
  | 'area'
  | 'approach'
  | 'communicationStyle'
  | 'context'
  | 'language'
  | 'sessionFormat'
  | 'availability'
  | 'guidance';

export type AiSignalConfidence = 'low' | 'medium' | 'high';

/** The draft fields a suggestion can write to. Mirrors the server's `DRAFT_FIELDS`. */
export type DraftField =
  | 'areasOfWork'
  | 'communicationStyles'
  | 'contextualExperiences'
  | 'languages'
  | 'sessionFormats';

/**
 * Where a kept suggestion lands, decided by the server.
 *
 * Sent rather than computed here so the interface cannot disagree with the validator about
 * which key belongs in which question. Adding a category on the server and forgetting this
 * module produces a suggestion with no target, which the interface renders as "noted, but
 * the intake has no question for it" — visibly wrong, rather than silently dropped.
 */
export type SuggestionTarget =
  | { readonly kind: 'draft'; readonly field: DraftField; readonly label: string }
  | { readonly kind: 'guidance'; readonly label: string }
  | {
      readonly kind: 'availabilityHint';
      readonly part: 'morning' | 'afternoon' | 'evening' | null;
      readonly days: readonly DayName[];
      readonly label: string;
    }
  | { readonly kind: 'note-only'; readonly label: string };

export interface AiSuggestion {
  readonly category: AiSignalCategory;
  readonly key: string;
  readonly confidence: AiSignalConfidence;
  /** One-valued by construction. The only legitimate source of a preference is the person. */
  readonly source: 'user_message';
  /** Why this was suggested, in one sentence, addressed to the person. */
  readonly explanation: string;
  readonly target: SuggestionTarget;
}

export interface AiTurn {
  readonly reply: string;
  /** The assistant's own view on whether it has enough to summarise. A hint, not a gate. */
  readonly readyToSummarise: boolean;
  /** Which implementation answered. Shown quietly, useful in a bug report. */
  readonly provider: string;
}

export interface AiExtraction {
  readonly suggestions: readonly AiSuggestion[];
  /** Said, but with nowhere in the intake to go. Shown, not swallowed. */
  readonly notUnderstood: readonly { readonly category: string; readonly key: string }[];
  /** Understood, but there was no room for it. */
  readonly surplus: readonly { readonly category: string; readonly key: string }[];
  readonly provider: string;
}

type SignalOptions = Omit<RequestOptions, 'method' | 'body'>;

/**
 * `POST /api/v1/ai/intake/turn`
 *
 * One turn of the conversation. Called only when the person sends a message — never on
 * render, never on a keystroke, and never twice for one message.
 */
export async function requestAiTurn(
  messages: readonly AiMessage[],
  known: AiKnownAnswers,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<AiTurn> {
  const payload = await client.request<unknown>(`${API_V1}/ai/intake/turn`, {
    ...options,
    method: 'POST',
    body: { messages, known },
  });

  if (!isTurn(payload)) {
    throw new ApiError({ kind: 'parse', detail: 'The assistant’s reply could not be read.' });
  }

  return payload;
}

/**
 * `POST /api/v1/ai/intake/extract`
 *
 * The whole conversation, read as suggestions. Separate from the turn so that asking for a
 * summary is a distinct act with a distinct request — a person who has said enough can skip
 * straight to the suggestions without the assistant having to decide they are done.
 */
export async function requestAiExtraction(
  messages: readonly AiMessage[],
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<AiExtraction> {
  const payload = await client.request<unknown>(`${API_V1}/ai/intake/extract`, {
    ...options,
    method: 'POST',
    body: { messages },
  });

  if (!isExtraction(payload)) {
    throw new ApiError({ kind: 'parse', detail: 'The suggestions could not be read.' });
  }

  return {
    suggestions: payload.signals,
    notUnderstood: payload.notUnderstood,
    // An older server has no `surplus` field. Absent is not the same as empty, and the
    // distinction is invisible here by design: "there was nothing more" and "this server does
    // not report surplus" both render as no surplus line, and only one of them is a claim.
    surplus: payload.surplus ?? [],
    provider: payload.provider,
  };
}

function isTurn(value: unknown): value is AiTurn {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AiTurn).reply === 'string' &&
    typeof (value as AiTurn).readyToSummarise === 'boolean' &&
    typeof (value as AiTurn).provider === 'string'
  );
}

/**
 * Read the extraction, tolerating an older server.
 *
 * `surplus` is treated as absent rather than as a failure, because a server from the previous
 * phase is a legitimate thing for this client to talk to during development, and a missing
 * "there was more than I could show" line is not worth failing a person's suggestions over.
 */
function isExtraction(value: unknown): value is {
  signals: readonly AiSuggestion[];
  notUnderstood: readonly { category: string; key: string }[];
  surplus?: readonly { category: string; key: string }[];
  provider: string;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    Array.isArray(candidate['signals']) &&
    candidate['signals'].every(isSuggestion) &&
    Array.isArray(candidate['notUnderstood']) &&
    typeof candidate['provider'] === 'string' &&
    (candidate['surplus'] === undefined || Array.isArray(candidate['surplus']))
  );
}

function isSuggestion(value: unknown): value is AiSuggestion {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const target = candidate['target'];

  return (
    typeof candidate['category'] === 'string' &&
    typeof candidate['key'] === 'string' &&
    (candidate['confidence'] === 'low' ||
      candidate['confidence'] === 'medium' ||
      candidate['confidence'] === 'high') &&
    candidate['source'] === 'user_message' &&
    typeof candidate['explanation'] === 'string' &&
    typeof target === 'object' &&
    target !== null &&
    typeof (target as SuggestionTarget).kind === 'string' &&
    typeof (target as SuggestionTarget).label === 'string'
  );
}
