import type { PrismaClient } from '../../generated/prisma/client.js';
import { DataStoreUnavailableError } from '../storeErrors.js';
import type { IntakeRepository } from './intakeRepository.js';
import type {
  AttributeOption,
  IntakeReceipt,
  IntakeRequest,
  IntakeVocabulary,
  LanguageOption,
} from './intakeTypes.js';

/**
 * Prisma behind the intake port.
 *
 * Two behaviours are worth reading before the code:
 *
 * 1. **The vocabulary is read, never assumed.** The client is asked to choose
 *    from what this database holds, so a keyword it sends is always one the
 *    database recognises.
 * 2. **A submission cannot be stored twice.** `submissionId` is unique, so a
 *    retry after a failed response — someone pressing "Try again", a double
 *    click, two tabs — returns the intake that was already written. The race is
 *    handled too: if two attempts arrive together and one loses the unique
 *    index, the winner's row is read back and returned.
 */
export function createPrismaIntakeRepository(client: PrismaClient): IntakeRepository {
  async function guard<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
    try {
      return await operation();
    } catch (error) {
      throw new DataStoreUnavailableError('The intake store is not available.', { cause: error });
    }
  }

  function receipt(intake: { id: string; createdAt: Date }): IntakeReceipt {
    return { intakeId: intake.id, receivedAt: intake.createdAt.toISOString() };
  }

  /** Resolve vocabulary keys to the rows the preference join tables need. */
  async function resolve(
    keys: readonly string[],
    lookup: (key: string) => Promise<{ id: string } | null>,
  ) {
    const rows = await Promise.all(keys.map((key) => lookup(key)));
    return rows.filter((row): row is { id: string } => row !== null).map((row) => ({ id: row.id }));
  }

  return {
    readVocabulary: (): Promise<IntakeVocabulary> =>
      guard(async () => {
        const [areas, styles, contexts, formats, languages] = await Promise.all([
          client.areaOfWork.findMany({
            select: { key: true, name: true },
            orderBy: { key: 'asc' },
          }),
          client.communicationStyle.findMany({
            select: { key: true, name: true },
            orderBy: { key: 'asc' },
          }),
          client.contextualExperience.findMany({
            select: { key: true, name: true },
            orderBy: { key: 'asc' },
          }),
          client.sessionFormat.findMany({
            select: { key: true, name: true },
            orderBy: { key: 'asc' },
          }),
          client.language.findMany({
            select: { code: true, name: true },
            orderBy: { name: 'asc' },
          }),
        ]);

        return {
          areasOfWork: areas satisfies readonly AttributeOption[],
          communicationStyles: styles satisfies readonly AttributeOption[],
          contextualExperience: contexts satisfies readonly AttributeOption[],
          sessionFormats: formats satisfies readonly AttributeOption[],
          languages: languages satisfies readonly LanguageOption[],
        };
      }),

    submit: (request: IntakeRequest): Promise<IntakeReceipt> =>
      guard(async () => {
        const stored = await client.intake.findUnique({
          where: { submissionId: request.submissionId },
        });

        if (stored !== null) {
          return receipt(stored);
        }

        // One visit, one client. `update: {}` makes a repeat visit a no-op
        // rather than an error, so the browser's identifier is the only handle
        // a prototype session has.
        const owner = await client.client.upsert({
          where: { sessionId: request.sessionId },
          create: { sessionId: request.sessionId },
          update: {},
          select: { id: true },
        });

        const [areas, styles, contexts, formats, languages] = await Promise.all([
          resolve(request.areasOfWork, (key) =>
            client.areaOfWork.findUnique({ where: { key }, select: { id: true } }),
          ),
          resolve(request.communicationStyles, (key) =>
            client.communicationStyle.findUnique({ where: { key }, select: { id: true } }),
          ),
          resolve(request.contextualExperiences, (key) =>
            client.contextualExperience.findUnique({ where: { key }, select: { id: true } }),
          ),
          resolve(request.sessionFormats, (key) =>
            client.sessionFormat.findUnique({ where: { key }, select: { id: true } }),
          ),
          resolve(request.languages, (code) =>
            client.language.findUnique({ where: { code }, select: { id: true } }),
          ),
        ]);

        try {
          const intake = await client.$transaction(async (tx) => {
            // One intake answers one preference set, so a resubmission replaces
            // it rather than accumulating several competing ones.
            await tx.clientPreference.deleteMany({ where: { clientId: owner.id } });
            await tx.clientAvailability.deleteMany({ where: { clientId: owner.id } });

            return tx.intake.create({
              data: {
                clientId: owner.id,
                submissionId: request.submissionId,
                rawText: request.rawText,
              },
              select: { id: true, createdAt: true },
            });
          });

          await client.clientPreference.create({
            data: {
              clientId: owner.id,
              // Recorded rather than inferred later: this set *is* these answers,
              // and a match made from an older intake must be explained by the
              // answers that intake was given.
              intakeId: intake.id,
              openToGuidance: request.openToGuidance,
              languages: { connect: languages },
              areasOfWork: { connect: areas },
              communicationStyles: { connect: styles },
              contextualExperience: { connect: contexts },
              sessionFormats: { connect: formats },
            },
          });

          const timezone = request.availability?.timezone;

          if (
            request.availability !== null &&
            timezone !== undefined &&
            request.availability.windows.length > 0
          ) {
            await client.clientAvailability.createMany({
              data: request.availability.windows.map((window) => ({
                clientId: owner.id,
                timezone,
                dayOfWeek: window.dayOfWeek,
                startMinute: window.startMinute,
                endMinute: window.endMinute,
              })),
            });
          }

          return receipt(intake);
        } catch (error) {
          // Another attempt won the race on the unique index. Its answer is the
          // answer; returning it is the whole point of the column.
          if (isUniqueViolation(error)) {
            const winner = await client.intake.findUnique({
              where: { submissionId: request.submissionId },
            });

            if (winner !== null) {
              return receipt(winner);
            }
          }

          throw error;
        }
      }),
  };
}

/**
 * Postgres reports a unique-index collision as SQLSTATE 23505, both through
 * Prisma's own error and through the driver's. Checking the code rather than the
 * error class keeps this working whichever way it arrives.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
