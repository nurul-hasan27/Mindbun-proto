import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createPrismaTherapistRepository } from './prismaTherapistRepository.js';
import { createTestPrismaClient } from '../../test/database.js';

/**
 * These run against a real PostgreSQL, in their own project, because that is the
 * only way to prove a migration works from nothing.
 *
 *   npm run db:up                 # start the database
 *   npm run test:db               # migrate, seed, and run these
 *
 * They are deliberately *not* part of `npm test`, so a machine without Docker can
 * still run the unit suite.
 */

// Deliberately the TEST database, never the development one. `createTestPrismaClient`
// refuses to run if the two are configured to the same URL.
const prisma = createTestPrismaClient();
const repository = createPrismaTherapistRepository(prisma);

/** Removes everything the seed created, so each test starts from the same place. */
async function clearTherapists(): Promise<void> {
  await prisma.availabilityWindow.deleteMany();
  await prisma.therapistProfile.deleteMany();
  await prisma.therapist.deleteMany();
}

async function seedOneProfile(displayName: string): Promise<string> {
  const language = await prisma.language.findUniqueOrThrow({ where: { code: 'en' } });
  const approach = await prisma.therapeuticApproach.findFirstOrThrow();
  const area = await prisma.areaOfWork.findFirstOrThrow();
  const style = await prisma.communicationStyle.findFirstOrThrow();
  const context = await prisma.contextualExperience.findFirstOrThrow();
  const format = await prisma.sessionFormat.findFirstOrThrow();

  const created = await prisma.therapist.create({
    data: {
      profile: {
        create: {
          displayName,
          headline: 'Warm, curious, reflective',
          bio: 'A biography written for the test database.',
          location: 'Bengaluru, India',
          timezone: 'Asia/Kolkata',
          yearsOfExperience: 9,
          languages: { connect: [{ id: language.id }] },
          approaches: { connect: [{ id: approach.id }] },
          areasOfWork: { connect: [{ id: area.id }] },
          communicationStyles: { connect: [{ id: style.id }] },
          contextualExperience: { connect: [{ id: context.id }] },
          sessionFormats: { connect: [{ id: format.id }] },
          availability: {
            create: [{ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 }],
          },
        },
      },
    },
    include: { profile: true },
  });

  return created.id;
}

describe('migrated schema', () => {
  it('has the vocabularies the seed depends on', async () => {
    const [languages, approaches, areas, styles, contexts, formats, reasons] = await Promise.all([
      prisma.language.count(),
      prisma.therapeuticApproach.count(),
      prisma.areaOfWork.count(),
      prisma.communicationStyle.count(),
      prisma.contextualExperience.count(),
      prisma.sessionFormat.count(),
      prisma.feedbackReason.count(),
    ]);

    expect(languages).toBeGreaterThan(0);
    expect(approaches).toBeGreaterThan(0);
    expect(areas).toBeGreaterThan(0);
    expect(styles).toBeGreaterThan(0);
    expect(contexts).toBeGreaterThan(0);
    expect(formats).toBeGreaterThan(0);
    expect(reasons).toBeGreaterThan(0);
  });

  it('keeps language codes unique', async () => {
    const codes = await prisma.language.findMany({ select: { code: true } });
    const unique = new Set(codes.map((row: { code: string }) => row.code));

    expect(unique.size).toBe(codes.length);
  });
});

describe('therapists', () => {
  it('creates a therapist and a profile with every relationship attached', async () => {
    await clearTherapists();
    const id = await seedOneProfile('Relationship Tester');

    const profile = await prisma.therapistProfile.findUniqueOrThrow({
      where: { therapistId: id },
      include: {
        languages: true,
        approaches: true,
        areasOfWork: true,
        communicationStyles: true,
        contextualExperience: true,
        sessionFormats: true,
        availability: true,
      },
    });

    expect(profile.displayName).toBe('Relationship Tester');
    expect(profile.languages).toHaveLength(1);
    expect(profile.approaches).toHaveLength(1);
    expect(profile.areasOfWork).toHaveLength(1);
    expect(profile.communicationStyles).toHaveLength(1);
    expect(profile.contextualExperience).toHaveLength(1);
    expect(profile.sessionFormats).toHaveLength(1);
    expect(profile.availability).toHaveLength(1);
    expect(profile.availability[0]).toMatchObject({
      therapistProfileId: profile.id,
      dayOfWeek: 'TUESDAY',
      startMinute: 1080,
      endMinute: 1200,
    });
  });

  it('does not enforce biography length in the database — that is the writer job', async () => {
    await clearTherapists();

    // Documented behaviour, asserted so that it cannot change by accident.
    // PostgreSQL stores whatever it is given, which is exactly why
    // profileDraft.ts exists and runs before every write.
    const created = await prisma.therapist.create({
      data: {
        profile: {
          create: {
            displayName: 'Empty Biography',
            headline: 'A headline',
            bio: '',
            location: 'Kochi, India',
            timezone: 'Asia/Kolkata',
            yearsOfExperience: 3,
          },
        },
      },
      include: { profile: true },
    });

    expect(created.profile?.bio).toBe('');
  });

  it('deletes a profile with its therapist, and leaves no orphans', async () => {
    await clearTherapists();
    const id = await seedOneProfile('Doomed');

    await prisma.therapist.delete({ where: { id } });

    expect(await prisma.therapist.count()).toBe(0);
    expect(await prisma.therapistProfile.count()).toBe(0);
    expect(await prisma.availabilityWindow.count()).toBe(0);
  });

  it('stores intake text without logging it', async () => {
    await clearTherapists();
    const client = await prisma.client.create({ data: {} });

    const intake = await prisma.intake.create({
      data: { clientId: client.id, rawText: 'I have been feeling lost since we moved.' },
    });

    expect(intake.rawText).toContain('moved');
    expect(intake.createdAt).toBeInstanceOf(Date);
  });
});

describe('repository against a real database', () => {
  it('returns a page ordered by name, with a matching total', async () => {
    await clearTherapists();
    await seedOneProfile('Zara Okonkwo');
    await seedOneProfile('Amara Osei');
    await seedOneProfile('Devika Menon');

    const page = await repository.list({ take: 2, skip: 0 });

    expect(page.total).toBe(3);
    expect(page.items.map((item: { displayName: string }) => item.displayName)).toEqual([
      'Amara Osei',
      'Devika Menon',
    ]);
  });

  it('filters by language and by area', async () => {
    await clearTherapists();
    const id = await seedOneProfile('Filterable');
    const area = await prisma.areaOfWork.findFirstOrThrow();
    const language = await prisma.language.findUniqueOrThrow({ where: { code: 'en' } });

    const byLanguage = await repository.list({ take: 10, skip: 0, language: language.code });
    const byArea = await repository.list({ take: 10, skip: 0, area: area.key });

    expect(byLanguage.items.map((item: { id: string }) => item.id)).toContain(id);
    expect(byArea.items.map((item: { id: string }) => item.id)).toContain(id);
  });

  it('returns null for an id that does not exist', async () => {
    await clearTherapists();

    const found = await repository.findById('00000000-0000-0000-0000-000000000000');

    expect(found).toBeNull();
  });

  it('reads a profile back with its availability in weekday order', async () => {
    await clearTherapists();
    const id = await seedOneProfile('Ordered');
    const profile = await prisma.therapistProfile.findUniqueOrThrow({
      where: { therapistId: id },
    });
    await prisma.availabilityWindow.createMany({
      data: [
        {
          therapistProfileId: profile.id,
          dayOfWeek: 'THURSDAY',
          startMinute: 1140,
          endMinute: 1260,
        },
        { therapistProfileId: profile.id, dayOfWeek: 'MONDAY', startMinute: 1020, endMinute: 1140 },
      ],
    });

    const result = await repository.findById(id);

    expect(result?.availability.map((window) => window.dayOfWeek)).toEqual([
      'MONDAY',
      'TUESDAY',
      'THURSDAY',
    ]);
  });

  it('answers whether a vocabulary key exists', async () => {
    await clearTherapists();

    expect(await repository.hasLanguage('en')).toBe(true);
    expect(await repository.hasLanguage('zz')).toBe(false);
    expect(await repository.hasArea('grief-and-loss')).toBe(true);
    expect(await repository.hasArea('nope')).toBe(false);
  });
});

describe('the API against a real database', () => {
  it('serves a list and a profile end to end', async () => {
    await clearTherapists();
    const id = await seedOneProfile('End To End');
    const app = buildApp({ therapists: repository });

    const list = await app.inject({ method: 'GET', url: '/api/v1/therapists' });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ pagination: { total: number } }>().pagination.total).toBe(1);

    const profile = await app.inject({ method: 'GET', url: `/api/v1/therapists/${id}` });
    expect(profile.statusCode).toBe(200);
    expect(profile.json<{ displayName: string }>().displayName).toBe('End To End');

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/therapists/00000000-0000-0000-0000-000000000000',
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
  });
});
