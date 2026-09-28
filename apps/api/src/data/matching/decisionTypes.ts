import type { MatchEvidenceInput } from './matchingTypes.js';
import type { TherapistProfileView } from '../therapists/therapistView.js';

/**
 * What a human matcher decided, and the read models the workspace is built from.
 *
 * The type that matters most here is `PresentedRecommendation`, and the reason it exists is
 * in `presented.ts`: three separate places need to know *who the client was shown*, and if
 * they each worked it out for themselves they would eventually disagree — and the failure
 * would be invisible, because the client's page would still render.
 */

/** A stable reason key, e.g. `stronger-contextual-experience`. */
export type DecisionReasonKey = string;

export type DecisionType = 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';

export const DECISION_TYPES: readonly DecisionType[] = [
  'SYSTEM_ACCEPTED',
  'HUMAN_SELECTED_ALTERNATIVE',
];

/** One term a matcher can pick from, as the database holds it. */
export interface DecisionReason {
  readonly key: DecisionReasonKey;
  readonly name: string;
  readonly description: string;
}

/** A recorded decision, as the workspace reads it back. */
export interface StoredDecision {
  readonly id: string;
  /** The case that was reviewed — the pass's recommended match. */
  readonly matchId: string;
  /** The candidate chosen. Equal to `matchId` when the suggestion was kept. */
  readonly selectedMatchId: string;
  /** Who was chosen, resolved from the selected candidate row rather than stored twice. */
  readonly therapistId: string;
  readonly decisionType: DecisionType;
  readonly reasonKeys: readonly DecisionReasonKey[];
  readonly note: string | null;
  /** ISO 8601, from the stored row rather than from a fresh clock reading. */
  readonly recordedAt: string;
}

/** What a matcher sends. Nothing here can name a client, an intake or a stranger. */
export interface DecisionRequest {
  /** The candidate row chosen, from the ones the case detail offered. */
  readonly selectedMatchId: string;
  /** Stable reason keys. Required when choosing an alternative, and accepted when keeping the suggestion. */
  readonly reasons: readonly DecisionReasonKey[];
  readonly note?: string;
}

/**
 * A candidate, as the workspace shows it.
 *
 * `shared` is the engine's own evidence, phrased as sentences — the same ones the client
 * would read, because a reviewer reasoning from different wording than the client is a
 * reviewer reasoning from a different understanding.
 *
 * `notOffered` is a plain set difference: terms the client asked for that this candidate
 * does not have. Not a score, not a penalty, and not an inference — it is the list of
 * stated preferences this person does not carry, which is the single most useful thing a
 * reviewer can know and the thing the engine's positive-only evidence cannot say.
 */
export interface CandidateView {
  readonly matchId: string;
  readonly therapist: TherapistProfileView;
  /** Whether the engine could show them at all. Only eligible candidates can be chosen. */
  readonly eligible: boolean;
  /** Why the engine set them aside, as a key. Null when eligible. */
  readonly rejectionCode: string | null;
  readonly shared: readonly { readonly key: string; readonly sentence: string }[];
  /** Grouped by category, and only for categories the client actually asked about. */
  readonly notOffered: readonly {
    readonly category: string;
    readonly names: readonly string[];
  }[];
}

/** One pass in the journey, as the timeline shows it. */
export interface JourneyStep {
  readonly attempt: number;
  /** The pass's recommended match, whether or not anyone is looking at it now. */
  readonly matchId: string;
  readonly systemSuggestedName: string;
  /** The reason keys the client gave, or empty when they said nothing. */
  readonly clientFeedback: readonly DecisionReasonKey[];
  /** The decision for this pass, when one has been made. */
  readonly decision: StoredDecision | null;
  /** Who the selected candidate is, when a decision exists. */
  readonly selectedName: string | null;
  /** The status the pass's own recommendation currently holds. */
  readonly status: 'ELIGIBLE' | 'INELIGIBLE' | 'RECOMMENDED' | 'DECLINED';
}

/** A case, as the list shows it. Deliberately thin: a reviewer scans these. */
export interface CaseSummary {
  /** The pass's recommended match. The case's identity. */
  readonly matchId: string;
  readonly intakeId: string;
  readonly attempt: number;
  /** Two or three needs as short phrases, for scanning. */
  readonly primaryNeeds: readonly string[];
  /** Who the engine suggested. */
  readonly systemSuggestedName: string;
  readonly status: 'NEEDS_REVIEW' | 'DECIDED';
  /** Whether this journey has been through feedback, so a reviewer knows the context. */
  readonly hasHistory: boolean;
}

/** A case in full: everything a matcher needs to decide it. */
export interface CaseDetail {
  readonly summary: CaseSummary;
  /** What the client asked for, as stored keys per family. */
  readonly needs: ClientNeeds;
  /** The engine's recommendation and the evidence for it. */
  readonly suggestion: SuggestedCandidate;
  /** A small set of other candidates the matcher may inspect. */
  readonly alternatives: readonly CandidateView[];
  /** The candidate ids that may be chosen. Exactly the eligible ones. */
  readonly selectableMatchIds: readonly string[];
  /** The reason keys on offer, read from the vocabulary. */
  readonly decisionReasons: readonly DecisionReason[];
  readonly journey: readonly JourneyStep[];
  /** The decision already made for this case, if any. */
  readonly decision: StoredDecision | null;
  /**
   * The client's own words, **only** when explicitly asked for.
   *
   * Absent from the payload otherwise, and reachable only through a separate request. A
   * reviewer can read it; nothing in the matching data depends on it, ever.
   */
  readonly clientsWords: ClientsWords | null;
}

/**
 * What the client asked for.
 *
 * Both forms, deliberately. A reviewer needs the name to read fluently and the key to
 * compare against a profile's stored attributes and against a candidate's `notOffered`
 * line — and where those disagree, the key is the one that is true. Carrying only names
 * would mean the interface could quietly present a display string as if it were the thing
 * that was actually stored.
 */
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
  /** As stored: a timezone and windows in the client's own local time. */
  readonly availability: {
    readonly timezone: string;
    readonly windows: readonly {
      readonly dayOfWeek: string;
      readonly startMinute: number;
      readonly endMinute: number;
    }[];
  } | null;
  /** Whether the client said they were not yet sure about a conversation style. */
  readonly openToGuidance: boolean;
  /** Whether the client insisted on anything, which is what makes it a requirement. */
  readonly markedAsRequirements: boolean;
}

/** The engine's recommendation, with its evidence. */
export interface SuggestedCandidate {
  readonly matchId: string;
  readonly therapist: TherapistProfileView;
  readonly shared: readonly { readonly key: string; readonly sentence: string }[];
  readonly notOffered: readonly { readonly category: string; readonly names: readonly string[] }[];
}

/**
 * The client's free text, behind an explicit opt-in.
 *
 * Held here rather than on `ClientNeeds` so that "not asked for" and "there is none" are
 * the same absence. A matcher should never have to check whether a field is empty because
 * it was withheld or because nothing was written.
 */
export interface ClientsWords {
  /** The closing note from the intake. */
  readonly intakeNote: string | null;
  /** Free text the client wrote when declining a previous recommendation. */
  readonly feedbackNotes: readonly { readonly attempt: number; readonly note: string }[];
}

/** Evidence in the form the workspace needs, before it is phrased. */
export type EvidenceForView = MatchEvidenceInput;
