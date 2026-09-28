import type { Explanation } from './explanations.js';
import type { ChangeNote } from './feedbackTypes.js';
import type { TherapistProfileView } from '../therapists/therapistView.js';

/**
 * A recommendation, as the services produce it.
 *
 * One type for a first match and for a rematch, because they are the same thing: a
 * first match is a rematch with an empty exclusion set and no feedback to act on. The
 * two services build the same object and the same route serialiser renders it, which is
 * what stops the first-match page and the rematch page from drifting into two
 * different shapes over time.
 *
 * It lives in the data layer rather than the route because the *rules* for filling it
 * are data rules: which pass this is, who the client came away from, and what can
 * honestly be said changed. The route's only job is to flatten a therapist view into
 * `{ key, name }` pairs and hand it to the JSON schema.
 *
 * Every field is present in every case, including the ones that are empty. `attempt` is
 * 1 on a first match; `previousTherapistName` is `null`; `whatChanged` is `[]`;
 * `adjustedFor` is `[]`. The absence of a change is a value to be read, not a missing
 * field to be inferred — a page that has to detect which shape it got is a page that
 * will eventually render nothing.
 */
export interface RecommendationBody {
  readonly matchId: string;
  /** Which pass this is. A count of searches, never of anything to do with a person. */
  readonly attempt: number;
  /** ISO 8601, from the stored row rather than from a fresh clock reading. */
  readonly decidedAt: string;
  readonly therapist: TherapistProfileView;
  readonly evidence: readonly Explanation[];
  /**
   * Who the client is being moved away from, by name.
   *
   * Someone they already saw and already turned down, so naming them is not offering a
   * second candidate. Null on a first match, where there is no one.
   */
  readonly previousTherapistName: string | null;
  /**
   * What is demonstrably different about this recommendation.
   *
   * Empty on a first match, and empty after a rematch where nothing the person
   * mentioned actually differs. Both are honest, and neither is padded.
   */
  readonly whatChanged: readonly ChangeNote[];
  /**
   * The reason keys the search was adjusted for.
   *
   * Keys rather than labels, so each can be traced to one rule in the source. Empty on
   * a first match, where nothing was adjusted.
   */
  readonly adjustedFor: readonly string[];
}
