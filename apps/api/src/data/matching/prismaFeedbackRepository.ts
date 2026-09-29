import type { PrismaClient } from '../../generated/prisma/client.js';
import { DataStoreUnavailableError } from '../storeErrors.js';
import type { DayName } from '../dayOfWeek.js';
import { presentedTherapistId } from './presented.js';
import type {
  ComparisonCandidate,
  FeedbackReason,
  FeedbackRepository,
  MatchHeader,
  RecordFeedbackInput,
} from './feedbackRepository.js';
import type { RematchContext, StoredFeedback } from './feedbackTypes.js';
import type { MatchEvidenceInput } from './matchingTypes.js';

/**
 * Prisma behind the feedback port.
 *
 * Two behaviours are worth reading before the code.
 *
 * 1. **Declining is one transaction.** The feedback row and the match's new status are
 *    written together, because a person who has been told "we'll look again" and a
 *    search that still thinks the old match is current is the worst outcome this feature
 *    has. It cannot happen through this adapter.
 *
 * 2. **The exclusion set is derived, never sent.** `loadRematchContext` computes it from
 *    what is `DECLINED` on *this intake*, which is the matching journey. There is no
 *    parameter for a caller to add to it, and nothing here reads a client or therapist
 *    id from a request body — the only input anywhere in this file is a `matchId`, from
 *    which everything else is reached.
 */
export function createPrismaFeedbackRepository(client: PrismaClient): FeedbackRepository {
  async function guard<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    try {
      return await operation();
    } catch (error) {
      throw new DataStoreUnavailableError('The feedback store is not available.', {
        cause: error,
      });
    }
  }

  return {
    findMatch: (matchId: string): Promise<MatchHeader | null> =>
      guard(async () => {
        const row = await client.match.findUnique({
          where: { id: matchId },
          select: {
            id: true,
            intakeId: true,
            clientId: true,
            therapistId: true,
            attempt: true,
            status: true,
            reviewedAsCase: {
              select: { selectedMatchId: true, selectedMatch: { select: { therapistId: true } } },
            },
            intake: {
              select: { matches: { where: { status: 'RECOMMENDED' }, select: { id: true } } },
            },
          },
        });

        if (row === null) {
          return null;
        }

        return {
          matchId: row.id,
          intakeId: row.intakeId,
          clientId: row.clientId,
          // Who the client was *shown*, which after a human review is not necessarily the
          // therapist the engine suggested. This is one of three places that needs this
          // answer, and the reason it is resolved by name in `presented.ts` rather than
          // written out here.
          therapistId: presentedTherapistId(
            { matchId: row.id, therapistId: row.therapistId },
            row.reviewedAsCase === null
              ? null
              : {
                  selectedMatchId: row.reviewedAsCase.selectedMatchId,
                  therapistId: row.reviewedAsCase.selectedMatch.therapistId,
                },
          ),
          attempt: row.attempt,
          status: row.status,
          isRecommended: row.intake.matches.some((match) => match.id === row.id),
        };
      }),

    findFeedback: (matchId: string): Promise<StoredFeedback | null> =>
      guard(async () => {
        const row = await client.feedback.findUnique({
          where: { matchId },
          include: { reasons: { select: { reason: { select: { key: true } } } } },
        });

        return row === null ? null : toStored(row);
      }),

    recordFeedback: (input: RecordFeedbackInput): Promise<StoredFeedback> =>
      guard(async () => {
        const existing = await client.feedback.findUnique({
          where: { matchId: input.matchId },
          include: { reasons: { select: { reason: { select: { key: true } } } } },
        });

        // One decline per match. A double submit returns the first answer rather than
        // writing a second opinion, which is what a retry is.
        if (existing !== null) {
          return toStored(existing);
        }

        const reasons = await resolveReasons(client, input.reasons);

        const written = await client.$transaction(async (tx) => {
          // The client, the intake and the therapist are read from the match inside
          // the transaction, never taken from a request. There is no code path here
          // that could write a complaint against someone else's match, because there is
          // no parameter through which "someone else" could arrive.
          const match = await tx.match.findUniqueOrThrow({
            where: { id: input.matchId },
            select: {
              clientId: true,
              intakeId: true,
              therapistId: true,
              reviewedAsCase: {
                select: { selectedMatchId: true, selectedMatch: { select: { therapistId: true } } },
              },
            },
          });

          // A complaint is about the person who was shown. After a human review that is
          // the matcher's choice, so recording the engine's suggestion instead would file
          // it against a stranger — and the exclusion set would then go on excluding the
          // wrong person for the rest of the journey.
          const shownTherapistId =
            match.reviewedAsCase?.selectedMatch.therapistId ?? match.therapistId;

          const feedback = await tx.feedback.create({
            data: {
              matchId: input.matchId,
              clientId: match.clientId,
              intakeId: match.intakeId,
              therapistId: shownTherapistId,
              text: input.rawText,
              reasons: { create: reasons.map((reasonId) => ({ reasonId })) },
            },
            include: { reasons: { select: { reason: { select: { key: true } } } } },
          });

          await tx.match.update({
            where: { id: input.matchId },
            data: { status: 'DECLINED' },
          });

          return feedback;
        });

        return toStored(written);
      }),

    loadRematchContext: (matchId: string): Promise<RematchContext | null> =>
      guard(async () => {
        const row = await client.match.findUnique({
          where: { id: matchId },
          select: {
            id: true,
            intakeId: true,
            clientId: true,
            therapistId: true,
            attempt: true,
            status: true,
            feedback: { select: { id: true } },
            reviewedAsCase: {
              select: { selectedMatchId: true, selectedMatch: { select: { therapistId: true } } },
            },
          },
        });

        if (row === null) {
          return null;
        }

        // Everyone already turned down *on this intake*, oldest first. Scoped to the
        // journey on purpose: a therapist declined here is perfectly recommendable to
        // someone else, or to this same person on a different intake later. Nothing
        // about one search should follow a person around the service.
        const declined = await client.match.findMany({
          where: { intakeId: row.intakeId, status: 'DECLINED' },
          select: {
            id: true,
            therapistId: true,
            attempt: true,
            reviewedAsCase: {
              select: { selectedMatchId: true, selectedMatch: { select: { therapistId: true } } },
            },
          },
          orderBy: { attempt: 'asc' },
        });

        const laterPass = await client.match.aggregate({
          where: { intakeId: row.intakeId, attempt: { gt: row.attempt } },
          _max: { attempt: true },
        });

        return {
          matchId: row.id,
          intakeId: row.intakeId,
          clientId: row.clientId,
          therapistId: row.reviewedAsCase?.selectedMatch.therapistId ?? row.therapistId,
          attempt: row.attempt,
          nextAttempt: row.attempt + 1,
          // Each declined case resolves to whoever the client was actually shown, which
          // after a human review is the matcher's choice. Excluding the engine's
          // suggestion instead would leave the person the client rejected eligible again,
          // and the rematch could return them.
          declinedTherapistIds: declined.map((entry) =>
            presentedTherapistId(
              { matchId: entry.id, therapistId: entry.therapistId },
              entry.reviewedAsCase === null
                ? null
                : {
                    selectedMatchId: entry.reviewedAsCase.selectedMatchId,
                    therapistId: entry.reviewedAsCase.selectedMatch.therapistId,
                  },
            ),
          ),
          hasLaterAttempt: laterPass._max.attempt !== null,
          hasFeedback: row.feedback !== null,
        };
      }),

    readMatchEvidence: (matchId: string): Promise<readonly MatchEvidenceInput[]> =>
      guard(async () => {
        const rows = await client.matchEvidence.findMany({
          where: { matchId },
          orderBy: { ordinal: 'asc' },
        });

        return rows.map(fromRow);
      }),

    readReasons: (): Promise<readonly FeedbackReason[]> =>
      guard(async () => {
        // Key order, so the page offers the same reasons in the same sequence on
        // every load and a test can assert against a fixed list.
        const rows = await client.feedbackReason.findMany({
          select: { key: true, name: true, description: true },
          orderBy: { key: 'asc' },
        });

        return rows;
      }),

    readComparisonCandidate: (therapistId: string): Promise<ComparisonCandidate | null> =>
      guard(async () => {
        const profile = await client.therapistProfile.findUnique({
          where: { therapistId },
          select: {
            displayName: true,
            areasOfWork: { select: { key: true } },
            communicationStyles: { select: { key: true } },
            approaches: { select: { key: true } },
            contextualExperience: { select: { key: true } },
            languages: { select: { code: true } },
            sessionFormats: { select: { key: true } },
          },
        });

        if (profile === null) {
          return null;
        }

        return {
          therapistId,
          displayName: profile.displayName,
          areasOfWork: profile.areasOfWork.map((row) => row.key),
          communicationStyles: profile.communicationStyles.map((row) => row.key),
          approaches: profile.approaches.map((row) => row.key),
          contextualExperience: profile.contextualExperience.map((row) => row.key),
          languages: profile.languages.map((row) => row.code),
          sessionFormats: profile.sessionFormats.map((row) => row.key),
        };
      }),
  };
}

/**
 * Reason keys to rows.
 *
 * A key the vocabulary does not hold resolves to nothing, so a browser cannot invent a
 * matching signal by sending a string the database has never heard of. The route also
 * rejects unknown keys with a `400`; this is the second lock rather than the first.
 */
async function resolveReasons(
  client: PrismaClient,
  keys: readonly string[],
): Promise<readonly string[]> {
  const rows = await client.feedbackReason.findMany({
    where: { key: { in: [...new Set(keys)] } },
    select: { id: true, key: true },
    orderBy: { key: 'asc' },
  });

  return rows.map((row) => row.id);
}

interface FeedbackRow {
  id: string;
  clientId: string;
  intakeId: string;
  therapistId: string;
  matchId: string;
  text: string | null;
  createdAt: Date;
  reasons: { reason: { key: string } }[];
}

function toStored(row: FeedbackRow): StoredFeedback {
  return {
    id: row.id,
    clientId: row.clientId,
    intakeId: row.intakeId,
    therapistId: row.therapistId,
    matchId: row.matchId,
    // Sorted, so the record and the resulting signals do not depend on the order the
    // boxes were ticked in.
    reasonKeys: row.reasons.map((entry) => entry.reason.key).sort(),
    rawText: row.text,
    createdAt: row.createdAt.toISOString(),
    recordedAt: row.createdAt.toISOString(),
  };
}

/** The inverse of the mapping in `prismaMatchRepository`, kept beside it on purpose. */
function fromRow(row: {
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

  return {
    category: row.category,
    strength: row.kind,
    clientKey: row.clientKey,
    therapistKey: row.therapistKey,
    explanation: row.explanation,
    weight: row.weight,
    ...(isAvailability &&
    row.overlapDayOfWeek !== null &&
    row.overlapStartMinute !== null &&
    row.overlapEndMinute !== null
      ? {
          overlap: {
            dayOfWeek: row.overlapDayOfWeek as DayName,
            startMinute: row.overlapStartMinute,
            endMinute: row.overlapEndMinute,
            therapistDayOfWeek: (row.therapistOverlapDayOfWeek ?? row.overlapDayOfWeek) as DayName,
            therapistStartMinute: row.therapistOverlapStartMinute ?? row.overlapStartMinute,
            therapistEndMinute: row.therapistOverlapEndMinute ?? row.overlapEndMinute,
            weeks:
              row.seasonal >= 2 ? ['winter', 'summer'] : [row.seasonal === 1 ? 'summer' : 'winter'],
          },
        }
      : {}),
  };
}
