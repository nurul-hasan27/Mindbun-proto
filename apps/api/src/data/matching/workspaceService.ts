import type {
  CandidateView,
  CaseDetail,
  CaseSummary,
  ClientNeeds,
  ClientsWords,
  DecisionType,
  JourneyStep,
  SuggestedCandidate,
} from './decisionTypes.js';
import type { MatchEvidenceInput } from './matchingTypes.js';
import type { FeedbackRepository } from './feedbackRepository.js';
import type { MatchRepository } from './matchRepository.js';
import type { StoredIntake } from './signals.js';
import type { TherapistRepository } from '../therapists/therapistRepository.js';
import type { TherapistProfileView } from '../therapists/therapistView.js';
import type {
  CaseCandidateRow,
  ClientsWordsRow,
  JourneyRow,
  StoredNeedKeys,
  WorkspaceRepository,
} from './workspaceRepository.js';
import { displayName, explainAll, type ExplanationVocabulary } from './explanations.js';
import { notOffered } from './notOffered.js';
import { DataStoreUnavailableError } from '../storeErrors.js';

/**
 * The human side of matching.
 *
 * ## The principle this is built around
 *
 * **The system assists the matcher. The matcher decides.**
 *
 * Three things follow, and each is a decision the code has to make rather than a principle
 * it can merely state:
 *
 * - **The engine is never presented as an authority.** It is a *suggestion*, labelled as
 *   one, and the case for it is shown as evidence rather than a number. A reviewer who
 *   cannot see why cannot disagree, and a reviewer who cannot disagree is not reviewing.
 * - **Disagreeing is a first-class outcome.** The reasons a matcher can give are about
 *   their own reading of two profiles, written from their side of the decision, and
 *   nothing here treats an override as an exception to be explained away.
 * - **The engine's work is not rewritten.** A decision is a new record beside the engine's.
 *   There is no update to a `Match` row anywhere in this phase, and the repository this
 *   writes through has no method that could.
 *
 * ## What a matcher may not do
 *
 * **They may not choose someone the engine set aside.**
 *
 * A candidate is ineligible because they did not meet something the client marked as a
 * must-have — no shared language, or no session format they accept. A human overrule would
 * put a client in front of a therapist who does not speak their language while the
 * recommendation page said they did, on a page whose entire promise is that every sentence
 * is backed by stored evidence.
 *
 * So it is enforced here rather than in the interface, and it is a real limit on the
 * matcher's authority rather than a courtesy. It is also not a demotion of the person doing
 * the work: they choose freely among everyone the engine considered viable, and "viable" is
 * a statement about the client's stated conditions rather than about anyone's worth.
 */

/**
 * How many alternatives to offer.
 *
 * Four, deliberately. Enough that a matcher sees a real choice rather than a formality,
 * few enough that the page is still a page. The backend evaluates every candidate; showing
 * fifty would be a dump of the engine's shortlist, and a matcher scrolling a list of fifty
 * is reading none of it.
 */
export const ALTERNATIVE_LIMIT = 4;

const MAX_NOTE_LENGTH = 2_000;

export type DecideOutcome =
  | {
      readonly kind: 'decided';
      readonly decisionType: DecisionType;
      readonly selectedMatchId: string;
      readonly selectedTherapistName: string;
      /** The engine's own suggestion, so the interface can show the difference at once. */
      readonly systemSuggestedName: string;
      /** True when the matcher chose someone other than the engine's suggestion. */
      readonly differs: boolean;
      readonly recordedAt: string;
    }
  | { readonly kind: 'unknown-case' }
  | { readonly kind: 'already-decided' }
  | {
      /**
       * The candidate is not one this case offered — either not in this pass at all, or
       * not among the alternatives shown.
       */
      readonly kind: 'not-offered';
    }
  | { readonly kind: 'set-aside' }
  | { readonly kind: 'no-reason' };

export interface WorkspaceDeps {
  readonly workspace: WorkspaceRepository;
  readonly matches: MatchRepository;
  readonly therapists: TherapistRepository;
  /**
   * The feedback vocabulary, read to put the client's own words on the timeline.
   *
   * Added in Phase 9, and the comment on `toJourney` says why: the client could not resolve
   * these keys because they were never sent, so the timeline was showing raw keys. Read for
   * its names only — nothing here reads the client's free text.
   */
  readonly feedback: FeedbackRepository;
}

/**
 * The queue: cases whose latest pass has a standing recommendation and no decision.
 *
 * A reviewer should not have to work out which cases are live. The rule is a fact of the
 * state machine rather than a flag: a pass stands for review while its recommendation is
 * `RECOMMENDED`, and asking for another option turns that into `DECLINED`. So the list is
 * every current, undecided recommendation in the system.
 */
export async function listCases(deps: WorkspaceDeps): Promise<readonly CaseSummary[]> {
  const [rows, names] = await Promise.all([
    deps.workspace.listCases(),
    deps.matches.readVocabularyNames(),
  ]);

  const vocabulary: ExplanationVocabulary = { names };

  return Promise.all(
    rows.map(async (row) => ({
      matchId: row.matchId,
      intakeId: row.intakeId,
      attempt: row.attempt,
      primaryNeeds: summaryNeeds(row.needs, vocabulary),
      systemSuggestedName: await nameOf(deps, row.recommendedTherapistId),
      status: 'NEEDS_REVIEW' as const,
      hasHistory: row.hasHistory,
    })),
  );
}

/**
 * The short line a queue is scanned by.
 *
 * Language first, then what the person wants help with, then how they want to talk. Those
 * are the three a reviewer sorts mentally by.
 *
 * **Sorted, not stored.** The order a client picked things in is not recorded — a
 * preference set is a set of rows — so any order this line shows is one the database
 * happened to return. Alphabetical at least looks like what it is. Leaving insertion order
 * in place would be worse than arbitrary: a reviewer would read the first term as the
 * priority, and nothing in the data says it is.
 */
function summaryNeeds(needs: StoredNeedKeys, vocabulary: ExplanationVocabulary): string[] {
  const phrase = (family: SummaryFamily, limit: number) => {
    if (needs.openToGuidance && family === 'communicationStyles') {
      return [];
    }

    return [...needs[family]]
      .sort()
      .slice(0, limit)
      .map((key) => displayName(key, vocabulary));
  };

  return [
    // Every language, not one of them. A client who said they speak two has not expressed
    // a preference between them, and a queue that named one would imply they had.
    ...phrase('languages', 4),
    // Two areas, because a client who named five would otherwise produce a summary line
    // that wraps and a queue that stops being scannable. The case page shows all of them.
    ...phrase('areasOfWork', 2),
    ...phrase('communicationStyles', 1),
  ];
}

/** The three families a summary line draws from, in the order a reviewer sorts by. */
type SummaryFamily = 'languages' | 'areasOfWork' | 'communicationStyles';

/** Every case in full: what they need, what was suggested, what else there is. */
export async function findCase(
  matchId: string,
  deps: WorkspaceDeps,
  options: { readonly revealWords?: boolean } = {},
): Promise<CaseDetail | null> {
  const record = await deps.workspace.findCase(matchId);

  if (record === null) {
    return null;
  }

  const vocabulary: ExplanationVocabulary = { names: await deps.matches.readVocabularyNames() };
  const matchable = await deps.matches.loadMatchableIntake(record.intakeId);

  if (matchable === null) {
    throw new DataStoreUnavailableError('The intake behind this case could not be read.');
  }

  const intake = matchable.intake;
  const suggestionRow = record.candidates.find((candidate) => candidate.matchId === record.matchId);

  if (suggestionRow === undefined) {
    // The pass's recommendation is always among its own candidates, so this is reachable
    // only if rows were deleted out from under a decision.
    throw new DataStoreUnavailableError('This case no longer has a recommendation to review.');
  }

  // The engine's own order, minus the recommendation, capped. Recovered from storage by
  // the repository rather than re-sorted here, so the shortlist is the engine's and not
  // this page's opinion of it.
  const others = record.candidates
    .filter((candidate) => candidate.matchId !== suggestionRow.matchId)
    .slice(0, ALTERNATIVE_LIMIT);

  const [suggestionTherapist, alternatives, reasons, journey, words] = await Promise.all([
    requireTherapist(deps, suggestionRow.therapistId),
    Promise.all(others.map((candidate) => toCandidateView(candidate, intake, deps, vocabulary))),
    deps.workspace.readDecisionReasons(),
    deps.workspace.listJourney(record.intakeId),
    options.revealWords === true
      ? deps.workspace.readClientsWords(record.intakeId)
      : Promise.resolve(null),
  ]);

  const suggestion: SuggestedCandidate = {
    matchId: suggestionRow.matchId,
    therapist: suggestionTherapist,
    shared: explainAll(suggestionRow.evidence, vocabulary),
    notOffered: notOffered(intake, suggestionRow.evidence, vocabulary),
  };

  return {
    summary: {
      matchId: record.matchId,
      intakeId: record.intakeId,
      attempt: record.attempt,
      primaryNeeds: summaryNeeds(toNeedKeys(intake), vocabulary),
      systemSuggestedName: suggestionTherapist.displayName,
      status: record.decision === null ? 'NEEDS_REVIEW' : 'DECIDED',
      hasHistory: journey.length > 1 || journey.some((step) => step.feedbackReasonKeys.length > 0),
    },
    needs: toNeeds(intake, vocabulary),
    suggestion,
    alternatives,
    /**
     * Exactly what may be chosen, and the same set the alternatives list offers.
     *
     * Validated against this in `decide` rather than against "any eligible candidate in
     * the pass", so the contract a client was shown and the contract the server enforces
     * cannot drift apart.
     */
    selectableMatchIds: [
      suggestionRow.matchId,
      ...alternatives
        .filter((candidate) => candidate.eligible)
        .map((candidate) => candidate.matchId),
    ],
    decisionReasons: reasons,
    journey: await toJourney(deps, journey),
    decision: record.decision,
    clientsWords: toWords(words),
  };
}

/**
 * Record what a matcher decided.
 *
 * Four refusals, and each says something different, because a matcher who cannot tell
 * *which* rule stopped them cannot fix it:
 *
 * - `not-offered` — the candidate is not among the ones this case showed. A stale page, a
 *   typo, or a candidate from a different pass.
 * - `set-aside` — the candidate is one the engine set aside, and no one may overrule that.
 *   A distinct answer from `not-offered`, because it is a real limit rather than a mistake.
 * - `no-reason` — choosing a different person without saying why. Accepting the engine's
 *   suggestion needs no justification, because nothing was overridden.
 * - `already-decided` — the case has a decision. A retry returns the first one.
 */
export async function decide(
  matchId: string,
  request: {
    readonly selectedMatchId: string;
    readonly reasons: readonly string[];
    readonly note?: string;
  },
  deps: WorkspaceDeps,
): Promise<DecideOutcome> {
  if (!isUuid(request.selectedMatchId)) {
    return { kind: 'not-offered' };
  }

  const record = await deps.workspace.findCase(matchId);

  if (record === null) {
    return { kind: 'unknown-case' };
  }

  const suggestionRow = record.candidates.find((candidate) => candidate.matchId === record.matchId);

  if (suggestionRow === undefined) {
    throw new DataStoreUnavailableError('This case no longer has a recommendation to review.');
  }

  if (record.decision !== null) {
    const decided = record.decision;

    return {
      kind: 'decided',
      decisionType: decided.decisionType,
      selectedMatchId: decided.selectedMatchId,
      selectedTherapistName: await nameOf(deps, decided.therapistId),
      systemSuggestedName: await nameOf(deps, record.recommendedTherapistId),
      differs: decided.selectedMatchId !== record.matchId,
      recordedAt: decided.recordedAt,
    };
  }

  const chosen = record.candidates.find(
    (candidate) => candidate.matchId === request.selectedMatchId,
  );

  if (chosen === undefined) {
    return { kind: 'not-offered' };
  }

  if (!chosen.eligible) {
    // The one limit on the matcher's authority, and it is a real one. A candidate the
    // engine set aside did not meet something the client marked as a must-have, and
    // showing them anyway would put a sentence on the client's page that the evidence
    // does not support.
    return { kind: 'set-aside' };
  }

  const isSuggestion = chosen.matchId === record.matchId;
  const reasons = [...new Set(request.reasons)].sort();

  if (!isSuggestion && reasons.length === 0) {
    // Overriding something requires saying why. Not a rule about politeness: without a
    // reason the audit trail records a disagreement with no explanation of it, which is
    // the one thing the trail exists to preserve.
    return { kind: 'no-reason' };
  }

  const known = new Set((await deps.workspace.readDecisionReasons()).map((entry) => entry.key));
  const accepted = reasons.filter((key) => known.has(key));

  const decision = await deps.workspace.recordDecision({
    matchId,
    selectedMatchId: chosen.matchId,
    // Derived from which candidate was chosen rather than sent. There is no field through
    // which a caller could label accepting the engine's suggestion as an override, or the
    // other way round.
    decisionType: isSuggestion ? 'SYSTEM_ACCEPTED' : 'HUMAN_SELECTED_ALTERNATIVE',
    reasonKeys: accepted,
    note: normaliseNote(request.note),
  });

  return {
    kind: 'decided',
    decisionType: decision.decisionType,
    selectedMatchId: decision.selectedMatchId,
    selectedTherapistName: await nameOf(deps, decision.therapistId),
    systemSuggestedName: await nameOf(deps, record.recommendedTherapistId),
    differs: decision.selectedMatchId !== record.matchId,
    recordedAt: decision.recordedAt,
  };
}

/** A candidate as the workspace shows it, with what they share and what they lack. */
async function toCandidateView(
  candidate: CaseCandidateRow,
  intake: StoredIntake,
  deps: WorkspaceDeps,
  vocabulary: ExplanationVocabulary,
): Promise<CandidateView> {
  const therapist = await requireTherapist(deps, candidate.therapistId);

  return {
    matchId: candidate.matchId,
    therapist,
    eligible: candidate.eligible,
    rejectionCode: candidate.rejectionCode,
    /**
     * Every reason, not the handful a client sees. A reviewer is inspecting rather than
     * being shown, and the point of the page is to see what there is. The limit that
     * belongs on a client-facing page would hide exactly what a reviewer needs here.
     */
    shared: explainAll(candidate.evidence, vocabulary),
    notOffered: notOffered(intake, candidate.evidence, vocabulary),
  };
}

async function toJourney(
  deps: WorkspaceDeps,
  journey: readonly JourneyRow[],
): Promise<readonly JourneyStep[]> {
  const ids = [
    ...journey.map((step) => step.recommendedTherapistId),
    ...journey.flatMap((step) =>
      step.selectedTherapistId === null ? [] : [step.selectedTherapistId],
    ),
  ];
  const names = new Map<string, string>();

  await Promise.all(
    [...new Set(ids)].map(async (therapistId) => {
      names.set(therapistId, await nameOf(deps, therapistId));
    }),
  );

  // What the client said about each earlier pass, in the client's own wording rather than
  // as stored keys.
  //
  // The keys still travel, because a key is the truth a profile's attributes are compared
  // against. But a matcher reading `communication-mismatch` has been shown a database key,
  // and the phase 7 timeline was doing exactly that: it built an empty lookup and fell
  // through to the key, so the sentence read "In an earlier search they said:
  // communication-mismatch." The client could not fix that on its own — the vocabulary was
  // never in the payload — so it is resolved here, where the store is.
  const feedbackNames = new Map<string, string>();

  try {
    for (const reason of await deps.feedback.readReasons()) {
      feedbackNames.set(reason.key, reason.name);
    }
  } catch {
    // An unreachable vocabulary is not a reason to fail a case read. The keys still travel
    // and the client is the fallback, which gives a worse sentence rather than no page.
  }

  return journey.map((step) => ({
    attempt: step.attempt,
    matchId: step.matchId,
    systemSuggestedName: names.get(step.recommendedTherapistId) ?? 'a therapist',
    clientFeedback: step.feedbackReasonKeys,
    clientFeedbackNames: step.feedbackReasonKeys.map((key) => feedbackNames.get(key) ?? key),
    decision: step.decision,
    selectedName:
      step.selectedTherapistId === null
        ? null
        : (names.get(step.selectedTherapistId) ?? 'a therapist'),
    status: step.status,
  }));
}

/** The client's needs, named. A reviewer reads these fluently and needs both forms. */
function toNeeds(intake: StoredIntake, vocabulary: ExplanationVocabulary): ClientNeeds {
  // Both forms, deliberately: the key is the truth a reviewer compares against a
  // candidate's stored attributes with, and the name is what they can read fluently.
  const named = (family: NeedFamily) =>
    intake[family].map((key) => ({ key, name: displayName(key, vocabulary) }));

  type NeedFamily =
    | 'areasOfWork'
    | 'communicationStyles'
    | 'approaches'
    | 'contextualExperiences'
    | 'languages'
    | 'sessionFormats';

  return {
    areasOfWork: named('areasOfWork'),
    communicationStyles: intake.openToGuidance ? [] : named('communicationStyles'),
    approaches: named('approaches'),
    contextualExperiences: named('contextualExperiences'),
    languages: named('languages'),
    sessionFormats: named('sessionFormats'),
    availability: intake.availability,
    openToGuidance: intake.openToGuidance,
    markedAsRequirements: intake.markedAsRequirements,
  };
}

/** The same needs as bare keys, for the summary line. */
function toNeedKeys(intake: StoredIntake): StoredNeedKeys {
  return {
    areasOfWork: intake.areasOfWork,
    communicationStyles: intake.communicationStyles,
    approaches: intake.approaches,
    contextualExperiences: intake.contextualExperiences,
    languages: intake.languages,
    sessionFormats: intake.sessionFormats,
    openToGuidance: intake.openToGuidance,
    markedAsRequirements: intake.markedAsRequirements,
  };
}

async function requireTherapist(
  deps: WorkspaceDeps,
  therapistId: string,
): Promise<TherapistProfileView> {
  const therapist = await deps.therapists.findById(therapistId);

  if (therapist === null) {
    // A recommendation that cannot name its person is not a recommendation, and a
    // candidate a matcher cannot open is not reviewable.
    throw new DataStoreUnavailableError('A therapist in this case could not be read.');
  }

  return therapist;
}

async function nameOf(deps: WorkspaceDeps, therapistId: string): Promise<string> {
  const therapist = await deps.therapists.findById(therapistId);
  return therapist?.displayName ?? 'A therapist';
}

function toWords(words: ClientsWordsRow | null): ClientsWords | null {
  if (words === null) {
    return null;
  }

  return {
    // An empty note and no note are the same absence, so a matcher is never asked to tell
    // the difference between "withheld" and "there wasn't any".
    intakeNote: words.intakeNote === '' ? null : words.intakeNote,
    feedbackNotes: words.feedbackNotes,
  };
}

/**
 * A matcher's note, or nothing.
 *
 * Trimmed and length-capped, and never logged — the same treatment every other free-text
 * field in this system has. The cap is not arbitrary: a matcher writing four pages is not
 * describing a choice, and storing all of it would be keeping something with no use and no
 * way to act on.
 */
function normaliseNote(note: string | undefined): string | null {
  if (note === undefined) {
    return null;
  }

  const trimmed = note.trim();

  if (trimmed === '') {
    return null;
  }

  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type { MatchEvidenceInput };
