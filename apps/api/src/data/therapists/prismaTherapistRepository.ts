import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { TherapistRepository } from './therapistRepository.js';
import { DataStoreUnavailableError } from '../storeErrors.js';
import type {
  AttributeView,
  AvailabilityWindowView,
  DayName,
  TherapistListQuery,
  TherapistListResult,
  TherapistProfileView,
  TherapistSummary,
} from './therapistView.js';

/** The relations a list needs, and nothing more: a list is a summary. */
const summaryInclude = {
  languages: { select: { code: true, name: true } },
  areasOfWork: { select: { key: true, name: true } },
  communicationStyles: { select: { key: true, name: true } },
} satisfies Prisma.TherapistProfileInclude;

const profileInclude = {
  ...summaryInclude,
  approaches: { select: { key: true, name: true } },
  contextualExperience: { select: { key: true, name: true } },
  sessionFormats: { select: { key: true, name: true } },
  availability: {
    select: { dayOfWeek: true, startMinute: true, endMinute: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  },
} satisfies Prisma.TherapistProfileInclude;

type SummaryRow = Prisma.TherapistProfileGetPayload<{ include: typeof summaryInclude }>;
type ProfileRow = Prisma.TherapistProfileGetPayload<{ include: typeof profileInclude }>;

function languageView(row: { code: string; name: string }): AttributeView {
  return { key: row.code, name: row.name };
}

function attributeView(row: { key: string; name: string }): AttributeView {
  return { key: row.key, name: row.name };
}

function byKey(a: AttributeView, b: AttributeView): number {
  return a.key.localeCompare(b.key);
}

const DAY_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const satisfies readonly DayName[];

type AvailabilityRow = ProfileRow['availability'][number];

function availabilityView(row: AvailabilityRow): AvailabilityWindowView {
  return {
    dayOfWeek: row.dayOfWeek,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  };
}

function toSummary(row: SummaryRow): TherapistSummary {
  return {
    id: row.therapistId,
    displayName: row.displayName,
    headline: row.headline,
    location: row.location,
    timezone: row.timezone,
    yearsOfExperience: row.yearsOfExperience,
    languages: row.languages.map(languageView).sort(byKey),
    areasOfWork: row.areasOfWork.map(attributeView).sort(byKey),
    communicationStyles: row.communicationStyles.map(attributeView).sort(byKey),
  };
}

function toProfile(row: ProfileRow): TherapistProfileView {
  return {
    ...toSummary(row),
    bio: row.bio,
    approaches: row.approaches.map(attributeView).sort(byKey),
    contextualExperience: row.contextualExperience.map(attributeView).sort(byKey),
    sessionFormats: row.sessionFormats.map(attributeView).sort(byKey),
    // Ordered by weekday, then time: an availability list is read top to bottom.
    availability: row.availability
      .map(availabilityView)
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
          a.startMinute - b.startMinute,
      ),
  };
}

/**
 * Wraps a Prisma client in the port the routes use.
 *
 * Ordering for a list is by display name, so a page of results reads
 * alphabetically to a person and is stable between requests — which matters more
 * than any notion of "relevance" until there is a ranking to apply.
 */
export function createPrismaTherapistRepository(client: PrismaClient): TherapistRepository {
  async function guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new DataStoreUnavailableError('The therapist store is not available.', {
        cause: error,
      });
    }
  }

  return {
    list: ({ take, skip, language, area }: TherapistListQuery): Promise<TherapistListResult> =>
      guard(async () => {
        const where: Prisma.TherapistProfileWhereInput = {
          ...(language === undefined ? {} : { languages: { some: { code: language } } }),
          ...(area === undefined ? {} : { areasOfWork: { some: { key: area } } }),
        };

        const [rows, total] = await Promise.all([
          client.therapistProfile.findMany({
            where,
            include: summaryInclude,
            orderBy: { displayName: 'asc' },
            take,
            skip,
          }),
          client.therapistProfile.count({ where }),
        ]);

        return { items: rows.map(toSummary), total };
      }),

    findById: (id: string): Promise<TherapistProfileView | null> =>
      guard(async () => {
        const row = await client.therapistProfile.findUnique({
          where: { therapistId: id },
          include: profileInclude,
        });

        return row === null ? null : toProfile(row);
      }),

    hasLanguage: (code: string): Promise<boolean> =>
      guard(async () => (await client.language.count({ where: { code } })) > 0),

    hasArea: (key: string): Promise<boolean> =>
      guard(async () => (await client.areaOfWork.count({ where: { key } })) > 0),
  };
}
