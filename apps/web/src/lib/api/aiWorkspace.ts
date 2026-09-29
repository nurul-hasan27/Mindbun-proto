import { API_V1 } from './version';
import { apiClient, type ApiClient, type RequestOptions } from './client';
import { ApiError } from './errors';

/**
 * The AI case summary, as the workspace asks for it.
 *
 * ## This lives in the workspace client, not the intake one
 *
 * That placement is the boundary. `api/workspace.ts` is already the module no page in the
 * client journey imports, and `workspaceBoundary.test.ts` proves it. Putting the AI summary
 * client there means it inherits the same property rather than needing a second argument
 * about why it is separate — there is nowhere in the client app that can reach it.
 *
 * ## What is asked for, and what is not
 *
 * The request is a `matchId` and nothing else. The server loads the case, builds the context
 * and calls the provider, so a caller cannot name a therapist, an intake, a client, or a
 * piece of text to summarise. The response is three lists of plain strings, and this client
 * validates all three before returning them.
 *
 * What the summary can never contain is enforced upstream, in `assertGroundedIn`: every
 * content word must be traceable to a field in the case, and figures, ranks, verdicts and
 * clinical language are refused outright.
 */

export interface AiCaseSummary {
  /** Two or three sentences on what the client asked for, and how the suggestion sits. */
  readonly summary: string;
  /**
   * Things worth a reviewer's attention, each traceable to a field.
   *
   * Capped and length-limited by the server. A list of everything is not a summary.
   */
  readonly observations: readonly string[];
  /**
   * Genuine tensions in the data.
   *
   * Empty is the honest and common case, and the interface says so rather than padding it.
   */
  readonly tradeoffs: readonly string[];
  /** Which implementation produced this. Shown quietly; useful in a bug report. */
  readonly provider: string;
}

type SummaryOptions = Omit<RequestOptions, 'method' | 'body' | 'query'>;

/**
 * `GET /api/v1/matching-workspace/cases/:matchId/ai-summary`
 *
 * A `GET`, deliberately: it is a read of a derived view, computed fresh from the rows the
 * evidence came from, so it cannot go stale relative to the evidence beside it. There is no
 * table of model output to accumulate, and a refresh re-reads rather than re-deciding.
 */
export async function fetchCaseSummary(
  matchId: string,
  client: ApiClient = apiClient,
  options: SummaryOptions = {},
): Promise<AiCaseSummary> {
  const payload = await client.get<unknown>(caseSummaryPath(matchId), options);

  if (!isCaseSummary(payload)) {
    throw new ApiError({
      kind: 'parse',
      detail: 'The case summary did not have the expected shape.',
    });
  }

  return payload;
}

/**
 * The path, exported so a test can assert on it without duplicating the string.
 *
 * Written out inline, in the same shape as the other three workspace resources in
 * `api/workspace.ts`. Note that this is the *API* path and is deliberately not built from
 * `workspaceCasePath` — that one is a browser route, and the two differ by a segment.
 */
export function caseSummaryPath(matchId: string): string {
  return `${API_V1}/matching-workspace/cases/${encodeURIComponent(matchId)}/ai-summary`;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isCaseSummary(value: unknown): value is AiCaseSummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<AiCaseSummary>;

  return (
    typeof candidate.summary === 'string' &&
    isStringList(candidate.observations) &&
    isStringList(candidate.tradeoffs) &&
    typeof candidate.provider === 'string'
  );
}
