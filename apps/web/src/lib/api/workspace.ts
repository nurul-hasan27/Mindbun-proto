import { API_V1 } from './version';
import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';
import type { AttributeView, AvailabilityWindowView, TherapistProfile } from './types';

/**
 * The internal matching workspace, as seen from a browser.
 *
 * ## This is an internal client, and it says so
 *
 * Every function here reaches `/matching-workspace`, which is an unauthenticated endpoint
 * in this prototype. There is no token, no session and no "signed in as" anywhere in this
 * codebase, and adding a pretend login would be faking authentication rather than
 * modelling it. What the code does instead is make the shape of the eventual work small:
 * the paths are one family, and nothing here can steer a review — there is no parameter
 * anywhere in this file for a client, an intake or a therapist.
 *
 * **What keeps these responses away from a client, precisely.** No page in the client
 * journey imports this module, and no client route links to the workspace or leads out of
 * it — so a person going through the intake is never shown a decision, a matcher's note or
 * another candidate.
 *
 * What that is *not* is a security boundary, and it would be dishonest to imply otherwise.
 * This is one single-page application, so the workspace's code is in the same bundle as the
 * client's, and the endpoints are unauthenticated. Someone who types `/matching-workspace`,
 * or who reads this file out of the bundle, can reach all of it. The real protection is that
 * the product never routes anybody there; the thing that would make it a boundary — an
 * account — is deliberately not built. See `docs/human-matching.md`.
 */

/** A case, as the queue shows it. Deliberately thin: a reviewer scans these. */
export interface CaseSummary {
  /** The case's identity: the pass's recommended match. */
  readonly matchId: string;
  readonly intakeId: string;
  /** Which search this is. A count of searches, never of anything to do with a person. */
  readonly attempt: number;
  /** A short line a queue is scanned by. Never every answer. */
  readonly primaryNeeds: readonly string[];
  /** Who the engine suggested. */
  readonly systemSuggestedName: string;
  readonly status: 'NEEDS_REVIEW' | 'DECIDED';
  /** Whether this journey has been through feedback. */
  readonly hasHistory: boolean;
}

/** A stored key with the name a reviewer reads. Both, because the key is the truth. */
export interface NamedNeed {
  readonly key: string;
  readonly name: string;
}

export interface ClientNeeds {
  readonly areasOfWork: readonly NamedNeed[];
  readonly communicationStyles: readonly NamedNeed[];
  readonly approaches: readonly NamedNeed[];
  readonly contextualExperiences: readonly NamedNeed[];
  readonly languages: readonly NamedNeed[];
  readonly sessionFormats: readonly NamedNeed[];
  readonly availability: {
    readonly timezone: string;
    readonly windows: readonly AvailabilityWindowView[];
  } | null;
  /**
   * The client said they were not yet sure about a conversation style.
   *
   * Sent because it changes what a reviewer should read: nobody asked for a style, so no
   * candidate can be said to be missing one.
   */
  readonly openToGuidance: boolean;
  /** The client insisted on something, which is what makes it a requirement. */
  readonly markedAsRequirements: boolean;
}

export interface SharedReason {
  readonly key: string;
  readonly sentence: string;
}

export interface NotOffered {
  readonly category: string;
  readonly names: readonly string[];
}

export interface Candidate {
  readonly matchId: string;
  readonly therapist: TherapistProfile;
  /** Whether the engine could show them at all. Only eligible candidates can be chosen. */
  readonly eligible: boolean;
  /** Why the engine set them aside, as a key. Null when eligible. */
  readonly rejectionCode: string | null;
  readonly shared: readonly SharedReason[];
  readonly notOffered: readonly NotOffered[];
}

export interface DecisionReason {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export interface RecordedDecision {
  readonly id: string;
  readonly matchId: string;
  readonly selectedMatchId: string;
  readonly decisionType: 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';
  /** Stable keys. The wording is the vocabulary's, not the audit trail's. */
  readonly reasonKeys: readonly string[];
  /** The matcher's own words. Internal, and unreachable from any client-facing page. */
  readonly note: string | null;
  readonly recordedAt: string;
}

export interface JourneyStep {
  readonly attempt: number;
  readonly matchId: string;
  readonly systemSuggestedName: string;
  /**
   * Reason keys the client gave. Keys, so each traces to a rule and a profile can be
   * compared against it. It is also what a key looks like on screen, which is why the words
   * are here too.
   */
  readonly clientFeedback: readonly string[];
  /**
   * The same reasons in the client's own words, resolved server-side.
   *
   * This payload never carried the feedback vocabulary, so the timeline used to fall through
   * to the key and show a matcher `communication-mismatch` on the one page in the product
   * whose purpose is to be readable.
   */
  readonly clientFeedbackNames: readonly string[];
  readonly decision: RecordedDecision | null;
  readonly selectedName: string | null;
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
}

export interface ClientsWords {
  readonly intakeNote: string | null;
  readonly feedbackNotes: readonly { readonly attempt: number; readonly note: string }[];
}

export interface CaseDetail {
  readonly summary: CaseSummary;
  readonly needs: ClientNeeds;
  readonly suggestion: Candidate;
  readonly alternatives: readonly Candidate[];
  /** Exactly what may be chosen, and the same set the alternatives list offers. */
  readonly selectableMatchIds: readonly string[];
  readonly decisionReasons: readonly DecisionReason[];
  readonly journey: readonly JourneyStep[];
  readonly decision: RecordedDecision | null;
  /** Absent unless asked for. `null` and "there wasn't any" are the same absence. */
  readonly clientsWords: ClientsWords | null;
}

export interface DecisionReceipt {
  readonly decisionType: 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';
  readonly selectedMatchId: string;
  readonly selectedTherapistName: string;
  /** Who the engine suggested, so the difference is visible at once. */
  readonly systemSuggestedName: string;
  readonly differs: boolean;
  readonly recordedAt: string;
}

type SignalOptions = Omit<RequestOptions, 'method' | 'body' | 'query'>;

/** The queue: cases whose latest pass has a standing recommendation and no decision. */
export async function fetchCases(
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<readonly CaseSummary[]> {
  const payload = await client.get<unknown>(`${API_V1}/matching-workspace/cases`, options);

  if (!isCaseList(payload)) {
    throw new ApiError({ kind: 'parse', detail: 'The case list had an unexpected shape.' });
  }

  return payload.cases;
}

/**
 * One case in full.
 *
 * `reveal` asks for the client's own words, and the server accepts only the exact word
 * `reveal` — anything else leaves the free text out. The button on the case page sends
 * that, and nothing else does, so the second request is visible in a network log and the
 * first response is provably free of it.
 */
export async function fetchCase(
  matchId: string,
  options: SignalOptions & { readonly reveal?: boolean } = {},
  client: ApiClient = apiClient,
): Promise<CaseDetail> {
  const query = options.reveal === true ? '?clientsWords=reveal' : '';
  const payload = await client.get<unknown>(
    `${API_V1}/matching-workspace/cases/${encodeURIComponent(matchId)}${query}`,
    options,
  );

  if (!isCaseDetail(payload)) {
    throw new ApiError({ kind: 'parse', detail: 'The case had an unexpected shape.' });
  }

  return payload;
}

/**
 * The client's own words, as a separate request.
 *
 * Reached only when a matcher asks. A separate endpoint rather than a query string on the
 * case, so that reaching for someone's free text is a visible second request in a network
 * log rather than a field that happened to be populated.
 */
export async function fetchClientsWords(
  matchId: string,
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<ClientsWords> {
  const payload = await client.get<unknown>(
    `${API_V1}/matching-workspace/cases/${encodeURIComponent(matchId)}/clients-words`,
    options,
  );

  if (!isClientsWords(payload)) {
    throw new ApiError({ kind: 'parse', detail: 'The client’s words had an unexpected shape.' });
  }

  return payload;
}

/**
 * Record what a matcher decided.
 *
 * The body names a candidate row from the ones the case offered. It does not name a
 * therapist, a client or an intake, and there is no `decisionType` field: the server works
 * out whether the suggestion was kept from which candidate was chosen, so a request cannot
 * claim an acceptance was an override or the reverse.
 *
 * Safe to retry. A case is decided once, and a repeated call returns the first decision
 * rather than writing a second one.
 */
export async function submitDecision(
  matchId: string,
  request: {
    readonly selectedMatchId: string;
    readonly reasons?: readonly string[];
    readonly note?: string;
  },
  client: ApiClient = apiClient,
  options: SignalOptions = {},
): Promise<DecisionReceipt> {
  const receipt = await client.request<unknown>(
    `${API_V1}/matching-workspace/cases/${encodeURIComponent(matchId)}/decision`,
    {
      ...options,
      method: 'POST',
      body: {
        selectedMatchId: request.selectedMatchId,
        ...(request.reasons === undefined ? {} : { reasons: [...request.reasons] }),
        ...(request.note === undefined ? {} : { note: request.note }),
      },
    },
  );

  if (!isDecisionReceipt(receipt)) {
    throw new ApiError({ kind: 'parse', detail: 'The decision had an unexpected shape.' });
  }

  return receipt;
}

// ---------------------------------------------------------------------------
// Shape checks
//
// Not about correctness — the server validates its own responses, and it refuses to send
// anything its schemas do not declare. They are about two halves of a prototype deployed
// independently not producing a page that renders `undefined` in the middle of a sentence
// for a person who is trying to do a job.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCaseList(value: unknown): value is { cases: readonly CaseSummary[] } {
  return isRecord(value) && Array.isArray(value['cases']) && value['cases'].every(isCaseSummary);
}

function isCaseSummary(value: unknown): value is CaseSummary {
  return (
    isRecord(value) &&
    typeof value['matchId'] === 'string' &&
    typeof value['attempt'] === 'number' &&
    Array.isArray(value['primaryNeeds']) &&
    typeof value['systemSuggestedName'] === 'string' &&
    (value['status'] === 'NEEDS_REVIEW' || value['status'] === 'DECIDED')
  );
}

function isCaseDetail(value: unknown): value is CaseDetail {
  return (
    isRecord(value) &&
    isCaseSummary(value['summary']) &&
    isCandidate(value['suggestion']) &&
    Array.isArray(value['alternatives']) &&
    value['alternatives'].every(isCandidate) &&
    Array.isArray(value['selectableMatchIds']) &&
    Array.isArray(value['journey']) &&
    value['journey'].every(isJourneyStep)
  );
}

function isCandidate(value: unknown): value is Candidate {
  return (
    isRecord(value) &&
    typeof value['matchId'] === 'string' &&
    isTherapist(value['therapist']) &&
    typeof value['eligible'] === 'boolean' &&
    Array.isArray(value['shared']) &&
    Array.isArray(value['notOffered'])
  );
}

function isTherapist(value: unknown): value is TherapistProfile {
  return (
    isRecord(value) &&
    typeof value['displayName'] === 'string' &&
    typeof value['headline'] === 'string' &&
    Array.isArray(value['languages']) &&
    Array.isArray(value['areasOfWork'])
  );
}

function isJourneyStep(value: unknown): value is JourneyStep {
  return (
    isRecord(value) &&
    typeof value['attempt'] === 'number' &&
    typeof value['systemSuggestedName'] === 'string' &&
    Array.isArray(value['clientFeedback']) &&
    // Accepted without the names, so this client can talk to a server from the previous
    // phase. The interface then shows keys, which is worse and still correct.
    (value['clientFeedbackNames'] === undefined || Array.isArray(value['clientFeedbackNames']))
  );
}

function isClientsWords(value: unknown): value is ClientsWords {
  return isRecord(value) && 'intakeNote' in value && Array.isArray(value['feedbackNotes']);
}

function isDecisionReceipt(value: unknown): value is DecisionReceipt {
  return (
    isRecord(value) &&
    typeof value['selectedMatchId'] === 'string' &&
    typeof value['selectedTherapistName'] === 'string' &&
    typeof value['systemSuggestedName'] === 'string' &&
    typeof value['differs'] === 'boolean'
  );
}

export type { AttributeView };
