import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { DataStoreUnavailableError } from '../storeErrors.js';
import type { DayName } from '../dayOfWeek.js';
import type { MatchEvidenceInput, MatchStatus, RejectionCode } from './matchingTypes.js';
import type {
  CandidateWindow,
  MatchRepository,
  MatchableIntake,
  PersistableEvaluation,
  PersistableRun,
  StoredRun,
} from './matchRepository.js';

/**
 * Prisma behind the matching port.
 *
 * Two behaviours are worth reading before the code.
 *
 * 1. **An intake is evaluated once.** There is a unique index on
 *    `(intakeId, therapistId)` and this adapter relies on it. Before writing, it
 *    checks whether a run already exists and returns that; if two attempts arrive
 *    together, the loser of the unique index reads the winner's row back rather than
 *    failing. That is the whole of the duplicate-submission safety, and it is the
 *    same shape Phase 4 used for intakes.
 *
 * 2. **Every candidate is written, not only the winner.** A run that stored one row
 *    would answer "who did you consider?" with nothing. Storing all of them is what
 *    makes the engine inspectable afterwards, and it costs rows rather than
 *    complexity.
 */

const EVALUATION_INCLUDE = {
  evidence: { orderBy: { ordinal: 'asc' } },
} satisfies Prisma.MatchInclude;

type EvaluationRow = Prisma.MatchGetPayload<{ include: typeof EVALUATION_INCLUDE }>;

export function createPrismaMatchRepository(client: PrismaClient): MatchRepository {
  async function guard<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    try {
      return await operation();
    } catch (error) {
      throw new DataStoreUnavailableError('The match store is not available.', { cause: error });
    }
  }

  return {
    loadMatchableIntake: (intakeId: string): Promise<MatchableIntake | null> =>
      guard(async () => {
        const intake = await client.intake.findUnique({
          where: { id: intakeId },
          select: {
            id: true,
            clientId: true,
            client: {
              select: {
                preferences: {
                  where: { intakeId: intakeId },
                  take: 1,
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
                },
                availability: {
                  select: { timezone: true, dayOfWeek: true, startMinute: true, endMinute: true },
                },
              },
            },
          },
        });

        if (intake === null) {
          return null;
        }

        // The set this intake produced, or — for a preference set that predates the
        // `intakeId` column — the client's most recent one, which is what the
        // matching phase would have used before the link existed.
        const own = await client.clientPreference.findFirst({
          where: { intakeId: intake.id },
          select: { kind: true },
        });

        const preference =
          intake.client.preferences[0] ??
          (own === null
            ? null
            : await client.clientPreference.findFirst({
                where: { clientId: intake.clientId },
                orderBy: { createdAt: 'desc' },
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
              }));

        // No preference set means nothing was answered, so there is nothing to match
        // on. An empty signal is a legitimate object; the engine simply finds no
        // eligible candidate and says so.
        const windows = intake.client.availability.map(toWindow);
        const timezone = intake.client.availability[0]?.timezone;

        return {
          intakeId: intake.id,
          clientId: intake.clientId,
          intake: {
            areasOfWork: (preference?.areasOfWork ?? []).map((row) => row.key),
            communicationStyles: (preference?.communicationStyles ?? []).map((row) => row.key),
            openToGuidance: preference?.openToGuidance ?? false,
            approaches: (preference?.approaches ?? []).map((row) => row.key),
            contextualExperiences: (preference?.contextualExperience ?? []).map((row) => row.key),
            languages: (preference?.languages ?? []).map((row) => row.code),
            sessionFormats: (preference?.sessionFormats ?? []).map((row) => row.key),
            availability: timezone === undefined ? null : { timezone, windows },
            markedAsRequirements: preference?.kind === 'REQUIREMENT',
          },
        };
      }),

    listCandidates: () =>
      guard(async () => {
        const profiles = await client.therapistProfile.findMany({
          select: {
            therapistId: true,
            displayName: true,
            timezone: true,
            areasOfWork: { select: { key: true } },
            communicationStyles: { select: { key: true } },
            approaches: { select: { key: true } },
            contextualExperience: { select: { key: true } },
            languages: { select: { code: true } },
            sessionFormats: { select: { key: true } },
            availability: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
          },
          // A fixed order so the engine's input list is the same on every run, even
          // before its own ordering kicks in. Determinism starts here.
          orderBy: { displayName: 'asc' },
        });

        return profiles.map((profile) => ({
          id: profile.therapistId,
          displayName: profile.displayName,
          timezone: profile.timezone,
          areasOfWork: profile.areasOfWork.map((row) => row.key),
          communicationStyles: profile.communicationStyles.map((row) => row.key),
          approaches: profile.approaches.map((row) => row.key),
          contextualExperience: profile.contextualExperience.map((row) => row.key),
          languages: profile.languages.map((row) => row.code),
          sessionFormats: profile.sessionFormats.map((row) => row.key),
          availability: profile.availability.map(toWindow),
        }));
      }),

    saveRun: (run: PersistableRun): Promise<StoredRun> =>
      guard(async () => {
        const alreadyThere = await findRun(client, run.intakeId);

        if (alreadyThere !== null) {
          return alreadyThere;
        }

        try {
          await client.$transaction(async (tx) => {
            for (const evaluation of run.evaluations) {
              await tx.match.create({
                data: {
                  clientId: run.clientId,
                  intakeId: run.intakeId,
                  therapistId: evaluation.therapistId,
                  engineVersion: run.engineVersion,
                  score: evaluation.score,
                  status: evaluation.status,
                  rejectionCode: evaluation.rejectionCode,
                  evidence: {
                    create: evaluation.evidence.map((item, index) => toEvidenceCreate(item, index)),
                  },
                },
              });
            }
          });
        } catch (error) {
          // Another attempt won the race. Its decision is the decision.
          if (isUniqueViolation(error)) {
            const winner = await findRun(client, run.intakeId);

            if (winner !== null) {
              return winner;
            }
          }

          throw error;
        }

        const stored = await findRun(client, run.intakeId);

        if (stored === null) {
          throw new DataStoreUnavailableError('The match could not be read back after writing.');
        }

        return stored;
      }),

    findRun: (intakeId: string): Promise<StoredRun | null> =>
      guard(() => findRun(client, intakeId)),

    readVocabularyNames: (): Promise<ReadonlyMap<string, string>> =>
      guard(async () => {
        const [areas, styles, approaches, contexts, formats, languages] = await Promise.all([
          client.areaOfWork.findMany({ select: { key: true, name: true } }),
          client.communicationStyle.findMany({ select: { key: true, name: true } }),
          client.therapeuticApproach.findMany({ select: { key: true, name: true } }),
          client.contextualExperience.findMany({ select: { key: true, name: true } }),
          client.sessionFormat.findMany({ select: { key: true, name: true } }),
          client.language.findMany({ select: { code: true, name: true } }),
        ]);

        // One flat map, because a key is unique across the vocabularies that share a
        // name. Where two could collide — an approach and a style both called
        // "exploratory" — the first wins, and the explanation reads the same either
        // way, so the collision is harmless rather than merely tolerated.
        return new Map([
          ...languages.map((row) => [row.code, row.name] as const),
          ...areas.map((row) => [row.key, row.name] as const),
          ...styles.map((row) => [row.key, row.name] as const),
          ...approaches.map((row) => [row.key, row.name] as const),
          ...contexts.map((row) => [row.key, row.name] as const),
          ...formats.map((row) => [row.key, row.name] as const),
        ]);
      }),
  };
}

function toWindow(row: {
  dayOfWeek: string;
  startMinute: number;
  endMinute: number;
}): CandidateWindow {
  return {
    dayOfWeek: row.dayOfWeek as DayName,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  };
}

/**
 * Evidence as a row.
 *
 * The overlap columns are filled only for availability, and the test suite asserts
 * that shape is exact in both directions — so a reader can tell what kind of
 * evidence a row is from its columns alone, without consulting the category.
 */
function toEvidenceCreate(item: MatchEvidenceInput, index: number) {
  const overlap = item.overlap;

  return {
    category: item.category,
    kind: item.strength,
    clientKey: item.clientKey,
    therapistKey: item.therapistKey,
    explanation: item.explanation,
    weight: item.weight,
    ordinal: index,
    // Availability is a season-dependent fact, stored as 2 when the slot holds in
    // both reference weeks and 1 when it holds in only one.
    seasonal: overlap === undefined ? 0 : overlap.weeks.length >= 2 ? 2 : 1,
    overlapDayOfWeek: overlap?.dayOfWeek ?? null,
    overlapStartMinute: overlap?.startMinute ?? null,
    overlapEndMinute: overlap?.endMinute ?? null,
    therapistOverlapDayOfWeek: overlap?.therapistDayOfWeek ?? null,
    therapistOverlapStartMinute: overlap?.therapistStartMinute ?? null,
    therapistOverlapEndMinute: overlap?.therapistEndMinute ?? null,
  };
}

function fromEvidenceRow(row: EvaluationRow['evidence'][number]): MatchEvidenceInput {
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
            dayOfWeek: row.overlapDayOfWeek,
            startMinute: row.overlapStartMinute,
            endMinute: row.overlapEndMinute,
            therapistDayOfWeek: row.therapistOverlapDayOfWeek ?? row.overlapDayOfWeek,
            therapistStartMinute: row.therapistOverlapStartMinute ?? row.overlapStartMinute,
            therapistEndMinute: row.therapistOverlapEndMinute ?? row.overlapEndMinute,
            weeks:
              row.seasonal >= 2 ? ['winter', 'summer'] : [row.seasonal === 1 ? 'summer' : 'winter'],
          },
        }
      : {}),
  };
}

/**
 * The stored run for an intake.
 *
 * `null` means nothing has been stored for this intake. A run that stored rows but
 * recommended nobody is a run with `recommendation: null` — a real outcome, with a
 * real count behind it, rather than a missing one.
 */
async function findRun(client: PrismaClient, intakeId: string): Promise<StoredRun | null> {
  const rows = await client.match.findMany({
    where: { intakeId },
    include: EVALUATION_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { therapistId: 'asc' }],
  });

  if (rows.length === 0) {
    return null;
  }

  const recommended = rows.find((row) => row.status === 'RECOMMENDED');
  const engineVersion = rows[0]?.engineVersion ?? '';
  const createdAt = rows[0]?.createdAt;

  return {
    intakeId,
    engineVersion,
    createdAt: createdAt === undefined ? '' : createdAt.toISOString(),
    considered: rows.length,
    recommendation:
      recommended === undefined
        ? null
        : {
            matchId: recommended.id,
            intakeId: recommended.intakeId,
            therapistId: recommended.therapistId,
            engineVersion: recommended.engineVersion,
            createdAt: recommended.createdAt.toISOString(),
            evidence: recommended.evidence.map(fromEvidenceRow),
          },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export type { PersistableEvaluation, MatchStatus, RejectionCode };
