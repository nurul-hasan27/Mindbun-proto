import type { PrismaClient } from '../../generated/prisma/client.js';
import { DataStoreUnavailableError } from '../storeErrors.js';
import type { StoredDecision } from './decisionTypes.js';
import type { MatchEvidenceInput } from './matchingTypes.js';
import type {
  CaseCandidateRow,
  CaseListRow,
  CaseRow,
  ClientsWordsRow,
  JourneyRow,
  RecordDecisionInput,
  WorkspaceRepository,
} from './workspaceRepository.js';

/**
 * Prisma behind the reviewer's port.
 *
 * Two behaviours worth reading before the code.
 *
 * 1. **Nothing here writes a `Match`.** No `update`, no `delete`, no `create` on that
 *    model. The engine's rows are what they are, and the reviewer's job is to add a record
 *    beside them. That is a property of this file's shape rather than of a convention, and
 *    it is the reason the audit trail cannot rot: there is no code path here that could
 *    make the engine look like it chose something it did not.
 *
 * 2. **The engine's ordering is recovered, not re-invented.** Rows come back ordered by
 *    `score` descending then therapist id ascending — precisely the order the engine
 *    produced, so the workspace shows the engine's own shortlist. The score is used to
 *    sort and is never selected, returned or sent.
 */

const DECISION_INCLUDE = {
  reasons: { select: { reason: { select: { key: true } } } },
  selectedMatch: { select: { therapistId: true } },
} as const;

interface DecisionRow {
  id: string;
  matchId: string;
  selectedMatchId: string;
  decisionType: 'SYSTEM_ACCEPTED' | 'HUMAN_SELECTED_ALTERNATIVE';
  note: string | null;
  createdAt: Date;
  reasons: { reason: { key: string } }[];
  selectedMatch: { therapistId: string };
}

function toDecision(row: DecisionRow): StoredDecision {
  return {
    id: row.id,
    matchId: row.matchId,
    selectedMatchId: row.selectedMatchId,
    // Resolved from the selected candidate row rather than stored twice, so it cannot
    // drift from the row the decision actually points at.
    therapistId: row.selectedMatch.therapistId,
    decisionType: row.decisionType,
    reasonKeys: row.reasons.map((entry) => entry.reason.key).sort(),
    note: row.note,
    recordedAt: row.createdAt.toISOString(),
  };
}

/** One preference set's keys, in the shape the list needs. */
interface PreferenceSet {
  kind: string;
  openToGuidance: boolean;
  areasOfWork: { key: string }[];
  communicationStyles: { key: string }[];
  approaches: { key: string }[];
  contextualExperience: { key: string }[];
  languages: { code: string }[];
  sessionFormats: { key: string }[];
}

/**
 * Keys, deduplicated.
 *
 * Deduplication rather than order, because the order a client picked things in is not
 * stored — the preference set is a set of rows. A summary line for a case list is
 * therefore deterministic rather than faithful to the sequence of clicks, and being
 * deterministic is what matters for a queue a reviewer scans.
 */
function flatKeys(rows: readonly { key: string }[]): readonly string[] {
  return [...new Set(rows.map((row) => row.key))];
}

function needsFrom(preferences: readonly PreferenceSet[]) {
  const first = preferences[0];

  return {
    areasOfWork: flatKeys(preferences.flatMap((pref) => pref.areasOfWork)),
    // Suppressed rather than empty when the client said they are not sure yet, for the
    // same reason the engine suppresses it: nobody asked for a particular style, so none
    // can be said to be missing from anyone.
    communicationStyles:
      first?.openToGuidance === true
        ? []
        : flatKeys(preferences.flatMap((p) => p.communicationStyles)),
    approaches: flatKeys(preferences.flatMap((pref) => pref.approaches)),
    contextualExperiences: flatKeys(preferences.flatMap((p) => p.contextualExperience)),
    languages: [...new Set(preferences.flatMap((pref) => pref.languages.map((row) => row.code)))],
    sessionFormats: flatKeys(preferences.flatMap((pref) => pref.sessionFormats)),
    openToGuidance: first?.openToGuidance ?? false,
    // A requirement is a preference the client insisted on. It is the intake phase's to
    // mark and never the engine's to infer, so it is read from the same column the engine
    // reads rather than worked out here.
    markedAsRequirements: preferences.some((pref) => pref.kind === 'REQUIREMENT'),
  };
}

export function createPrismaWorkspaceRepository(client: PrismaClient): WorkspaceRepository {
  async function guard<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    try {
      return await operation();
    } catch (error) {
      throw new DataStoreUnavailableError('The matching workspace is not available.', {
        cause: error,
      });
    }
  }

  async function decisionsFor(
    matchIds: readonly string[],
  ): Promise<ReadonlyMap<string, StoredDecision>> {
    if (matchIds.length === 0) {
      return new Map();
    }

    const rows = await client.matchingDecision.findMany({
      where: { matchId: { in: [...matchIds] } },
      include: DECISION_INCLUDE,
    });

    return new Map(rows.map((row) => [row.matchId, toDecision(row)]));
  }

  return {
    listCases: (): Promise<readonly CaseListRow[]> =>
      guard(async () => {
        // A pass stands for review while its recommendation is `RECOMMENDED`. An earlier
        // pass cannot still be `RECOMMENDED` if a later one exists, because the only route
        // to a later one runs through feedback and feedback is what declines it — so this
        // is the current pass of each intake without needing a "needs review" column.
        const rows = await client.match.findMany({
          where: { status: 'RECOMMENDED', reviewedAsCase: null },
          select: {
            id: true,
            intakeId: true,
            attempt: true,
            therapistId: true,
            intake: {
              select: {
                // The intake's own preference set, which is what its answers are read
                // from. `ClientPreference.intakeId` is what distinguishes one submission's
                // answers from another's; the engine reads the same set, so a reviewer's
                // view of "what did they ask for" cannot drift from the engine's.
                producedPreferences: {
                  select: {
                    kind: true,
                    openToGuidance: true,
                    areasOfWork: { select: { key: true } },
                    communicationStyles: { select: { key: true } },
                    approaches: { select: { key: true } },
                    contextualExperience: { select: { key: true } },
                    languages: { select: { code: true } },
                    sessionFormats: { select: { key: true } },
                  },
                  orderBy: { createdAt: 'asc' },
                },
                matches: { select: { attempt: true, feedback: { select: { text: true } } } },
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });

        return rows.map((row) => ({
          matchId: row.id,
          intakeId: row.intakeId,
          attempt: row.attempt,
          recommendedTherapistId: row.therapistId,
          // A to-one relation, so absent feedback is `null` rather than an empty list.
          hasHistory:
            row.intake.matches.length > 1 ||
            row.intake.matches.some((entry) => entry.feedback?.text != null),
          needs: needsFrom(row.intake.producedPreferences),
        }));
      }),

    findCase: (matchId: string): Promise<CaseRow | null> =>
      guard(async () => {
        const head = await client.match.findUnique({
          where: { id: matchId },
          select: {
            id: true,
            intakeId: true,
            clientId: true,
            attempt: true,
            status: true,
            therapistId: true,
          },
        });

        if (head === null) {
          return null;
        }

        const [candidateRows, decision] = await Promise.all([
          // The engine's own order, recovered from storage. `score` decides the sequence
          // and is never selected, so it cannot travel to a response.
          client.match.findMany({
            where: { intakeId: head.intakeId, attempt: head.attempt },
            select: {
              id: true,
              therapistId: true,
              status: true,
              rejectionCode: true,
              evidence: {
                select: {
                  category: true,
                  kind: true,
                  clientKey: true,
                  therapistKey: true,
                  explanation: true,
                  weight: true,
                  ordinal: true,
                  overlapDayOfWeek: true,
                  overlapStartMinute: true,
                  overlapEndMinute: true,
                  therapistOverlapDayOfWeek: true,
                  therapistOverlapStartMinute: true,
                  therapistOverlapEndMinute: true,
                  seasonal: true,
                },
                orderBy: { ordinal: 'asc' },
              },
            },
            orderBy: [{ score: 'desc' }, { therapistId: 'asc' }],
          }),
          client.matchingDecision.findUnique({
            where: { matchId },
            include: DECISION_INCLUDE,
          }),
        ]);

        const candidates: CaseCandidateRow[] = candidateRows.map((row) => ({
          matchId: row.id,
          therapistId: row.therapistId,
          eligible: row.status === 'ELIGIBLE' || row.status === 'RECOMMENDED',
          rejectionCode: row.rejectionCode,
          evidence: row.evidence.map(fromEvidenceRow),
        }));

        return {
          matchId: head.id,
          intakeId: head.intakeId,
          clientId: head.clientId,
          attempt: head.attempt,
          status: head.status,
          recommendedTherapistId: head.therapistId,
          candidates,
          decision: decision === null ? null : toDecision(decision),
        };
      }),

    listJourney: (intakeId: string): Promise<readonly JourneyRow[]> =>
      guard(async () => {
        const rows = await client.match.findMany({
          where: { intakeId, status: { in: ['RECOMMENDED', 'DECLINED'] } },
          select: {
            id: true,
            attempt: true,
            therapistId: true,
            status: true,
            feedback: { select: { reasons: { select: { reason: { select: { key: true } } } } } },
            reviewedAsCase: { include: DECISION_INCLUDE },
          },
          orderBy: { attempt: 'asc' },
        });

        return rows.map((row) => ({
          attempt: row.attempt,
          matchId: row.id,
          recommendedTherapistId: row.therapistId,
          status: row.status,
          feedbackReasonKeys: row.feedback?.reasons.map((entry) => entry.reason.key).sort() ?? [],
          decision: row.reviewedAsCase === null ? null : toDecision(row.reviewedAsCase),
          selectedTherapistId: row.reviewedAsCase?.selectedMatch.therapistId ?? null,
        }));
      }),

    findDecisions: (matchIds: readonly string[]): Promise<ReadonlyMap<string, StoredDecision>> =>
      guard(() => decisionsFor(matchIds)),

    recordDecision: (input: RecordDecisionInput): Promise<StoredDecision> =>
      guard(async () => {
        // One decision per case. A repeated call is a retry and returns the first answer,
        // which is also why there is no "revise a decision" path: a decision is a record of
        // a past moment, and changing it would rewrite the audit trail it exists to keep.
        const existing = await client.matchingDecision.findUnique({
          where: { matchId: input.matchId },
          include: DECISION_INCLUDE,
        });

        if (existing !== null) {
          return toDecision(existing);
        }

        const reasonIds = await resolveReasonIds(client, input.reasonKeys);

        const written = await client.matchingDecision.create({
          data: {
            matchId: input.matchId,
            selectedMatchId: input.selectedMatchId,
            decisionType: input.decisionType,
            note: input.note,
            reasons: { create: reasonIds.map((reasonId) => ({ reasonId })) },
          },
          include: DECISION_INCLUDE,
        });

        return toDecision(written);
      }),

    readDecisionReasons: (): Promise<
      readonly { key: string; name: string; description: string }[]
    > =>
      guard(async () => {
        // Key order, so the workspace offers the same reasons in the same sequence on
        // every load and a test can assert against a fixed list.
        const rows = await client.matchingDecisionReason.findMany({
          select: { key: true, name: true, description: true },
          orderBy: { key: 'asc' },
        });

        return rows;
      }),

    readClientsWords: (intakeId: string): Promise<ClientsWordsRow> =>
      guard(async () => {
        const rows = await client.intake.findUnique({
          where: { id: intakeId },
          select: {
            rawText: true,
            matches: {
              where: { status: 'DECLINED' },
              select: {
                attempt: true,
                feedback: { select: { text: true } },
              },
              orderBy: { attempt: 'asc' },
            },
          },
        });

        return {
          // An intake that cannot be read is as good as one with no note: the workspace
          // shows what it has, and the matcher decides whether that is enough.
          intakeNote: rows?.rawText ?? null,
          feedbackNotes:
            rows?.matches.flatMap((entry) =>
              entry.feedback?.text == null
                ? []
                : [{ attempt: entry.attempt, note: entry.feedback.text }],
            ) ?? [],
        };
      }),
  };
}

/**
 * Reason keys to rows.
 *
 * A key the vocabulary does not hold resolves to nothing, so a caller cannot invent a
 * justification by sending a string the database has never heard of. The route checks the
 * same set first and refuses with a sentence; this is the second lock.
 */
async function resolveReasonIds(
  client: PrismaClient,
  keys: readonly string[],
): Promise<readonly string[]> {
  if (keys.length === 0) {
    return [];
  }

  const rows = await client.matchingDecisionReason.findMany({
    where: { key: { in: [...new Set(keys)] } },
    select: { id: true, key: true },
    orderBy: { key: 'asc' },
  });

  return rows.map((row) => row.id);
}

/**
 * An evidence row as the workspace reads it.
 *
 * The same mapping the explanation path uses, so a reviewer reads the *stored* evidence
 * rather than a second interpretation of it. That matters most for availability, where the
 * shared window is what the client was told.
 */
function fromEvidenceRow(row: {
  category: MatchEvidenceInput['category'];
  kind: MatchEvidenceInput['strength'];
  clientKey: string;
  therapistKey: string;
  explanation: MatchEvidenceInput['explanation'];
  weight: number;
  overlapDayOfWeek: string | null;
  overlapStartMinute: number | null;
  overlapEndMinute: number | null;
  therapistOverlapDayOfWeek: string | null;
  therapistOverlapStartMinute: number | null;
  therapistOverlapEndMinute: number | null;
  seasonal: number;
}): MatchEvidenceInput {
  const isAvailability = row.category === 'AVAILABILITY';

  if (
    !isAvailability ||
    row.overlapDayOfWeek === null ||
    row.overlapStartMinute === null ||
    row.overlapEndMinute === null
  ) {
    return {
      category: row.category,
      strength: row.kind,
      clientKey: row.clientKey,
      therapistKey: row.therapistKey,
      explanation: row.explanation,
      weight: row.weight,
    };
  }

  return {
    category: row.category,
    strength: row.kind,
    clientKey: row.clientKey,
    therapistKey: row.therapistKey,
    explanation: row.explanation,
    weight: row.weight,
    overlap: {
      dayOfWeek: row.overlapDayOfWeek as never,
      startMinute: row.overlapStartMinute,
      endMinute: row.overlapEndMinute,
      therapistDayOfWeek: (row.therapistOverlapDayOfWeek ?? row.overlapDayOfWeek) as never,
      therapistStartMinute: row.therapistOverlapStartMinute ?? row.overlapStartMinute,
      therapistEndMinute: row.therapistOverlapEndMinute ?? row.overlapEndMinute,
      weeks: row.seasonal >= 2 ? ['winter', 'summer'] : [row.seasonal === 1 ? 'summer' : 'winter'],
    },
  };
}
