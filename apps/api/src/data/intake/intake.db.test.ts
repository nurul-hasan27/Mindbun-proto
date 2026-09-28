import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createTestPrismaClient } from '../../test/database.js';
import { createPrismaIntakeRepository } from './prismaIntakeRepository.js';
import type { IntakeRequest } from './intakeTypes.js';

/**
 * These run against a real PostgreSQL, in the `db` project, because proving that
 * an intake is stored — and stored once — is the whole point.
 *
 *   npm run db:up
 *   npm run test:db
 */

const prisma = createTestPrismaClient();
const repository = createPrismaIntakeRepository(prisma);

const VALID: IntakeRequest = {
  sessionId: randomUUID(),
  submissionId: randomUUID(),
  areasOfWork: ['relationships', 'career-transitions'],
  communicationStyles: ['exploratory'],
  contextualExperiences: ['relocation'],
  languages: ['en', 'hi'],
  sessionFormats: ['online'],
  availability: {
    timezone: 'Asia/Kolkata',
    windows: [
      { dayOfWeek: 'TUESDAY', startMinute: 1020, endMinute: 1260 },
      { dayOfWeek: 'THURSDAY', startMinute: 1080, endMinute: 1200 },
    ],
  },
  openToGuidance: false,
  rawText: 'I would like to talk about work.',
};

/** Removes every trace of the given session, so tests cannot influence each other. */
async function forget(sessionId: string): Promise<void> {
  const owner = await prisma.client.findUnique({ where: { sessionId }, select: { id: true } });

  if (owner === null) {
    return;
  }

  await prisma.clientAvailability.deleteMany({ where: { clientId: owner.id } });
  await prisma.clientPreference.deleteMany({ where: { clientId: owner.id } });
  await prisma.intake.deleteMany({ where: { clientId: owner.id } });
  await prisma.client.delete({ where: { id: owner.id } });
}

async function forgetAll(): Promise<void> {
  await prisma.clientAvailability.deleteMany();
  await prisma.clientPreference.deleteMany();
  await prisma.intake.deleteMany();
  await prisma.client.deleteMany();
}

describe('reading the vocabulary', () => {
  it('returns every term the seed owns, in a stable order', async () => {
    const vocabulary = await repository.readVocabulary();

    expect(vocabulary.areasOfWork.length).toBeGreaterThan(0);
    expect(vocabulary.communicationStyles.length).toBeGreaterThan(0);
    expect(vocabulary.contextualExperience.length).toBeGreaterThan(0);
    expect(vocabulary.languages.length).toBeGreaterThan(0);
    expect(vocabulary.sessionFormats.length).toBeGreaterThan(0);

    const twice = await repository.readVocabulary();
    expect(vocabulary).toEqual(twice);
  });

  it('includes a language the intake step needs to offer', async () => {
    const vocabulary = await repository.readVocabulary();
    const codes = vocabulary.languages.map((language) => language.code);

    for (const required of ['en', 'hi', 'bn', 'ta', 'ml']) {
      expect(codes, required).toContain(required);
    }
  });
});

describe('storing an intake', () => {
  it('creates a client, an intake, one preference set, and the availability', async () => {
    await forgetAll();
    const request: IntakeRequest = {
      ...VALID,
      sessionId: randomUUID(),
      submissionId: randomUUID(),
    };

    const receipt = await repository.submit(request);

    const owner = await prisma.client.findUniqueOrThrow({
      where: { sessionId: request.sessionId },
      include: {
        intakes: true,
        preferences: {
          include: {
            languages: true,
            areasOfWork: true,
            communicationStyles: true,
            contextualExperience: true,
            sessionFormats: true,
          },
        },
        availability: true,
      },
    });

    expect(owner.intakes).toHaveLength(1);
    expect(owner.intakes[0]?.id).toBe(receipt.intakeId);
    expect(owner.intakes[0]?.rawText).toBe('I would like to talk about work.');

    expect(owner.preferences).toHaveLength(1);
    const preference = owner.preferences[0];
    expect(preference?.areasOfWork).toHaveLength(2);
    expect(preference?.languages).toHaveLength(2);
    expect(preference?.communicationStyles).toHaveLength(1);
    expect(preference?.contextualExperience).toHaveLength(1);
    expect(preference?.sessionFormats).toHaveLength(1);
    expect(preference?.openToGuidance).toBe(false);

    expect(owner.availability).toHaveLength(2);
    expect(owner.availability.every((window) => window.timezone === 'Asia/Kolkata')).toBe(true);

    await forget(request.sessionId);
  });

  it('reuses the same client for a second visit, and replaces the preferences', async () => {
    await forgetAll();
    const sessionId = randomUUID();

    await repository.submit({ ...VALID, sessionId, submissionId: randomUUID() });
    await repository.submit({
      ...VALID,
      sessionId,
      submissionId: randomUUID(),
      areasOfWork: ['life-transitions'],
      languages: ['en'],
      sessionFormats: ['in-person'],
      rawText: 'A different answer this time.',
    });

    expect(await prisma.client.count()).toBe(1);
    expect(await prisma.intake.count()).toBe(2);

    const owner = await prisma.client.findUniqueOrThrow({
      where: { sessionId },
      include: { preferences: { include: { areasOfWork: true, languages: true } } },
    });

    // One authoritative preference set, not two competing ones.
    expect(owner.preferences).toHaveLength(1);
    expect(owner.preferences[0]?.areasOfWork).toHaveLength(1);
    expect(owner.preferences[0]?.languages).toHaveLength(1);

    await forget(sessionId);
  });

  it('stores "not sure yet" as a real answer rather than an empty list', async () => {
    await forgetAll();
    const request: IntakeRequest = {
      ...VALID,
      sessionId: randomUUID(),
      submissionId: randomUUID(),
      communicationStyles: [],
      openToGuidance: true,
    };

    await repository.submit(request);

    const preference = await prisma.clientPreference.findFirstOrThrow({
      include: { communicationStyles: true },
    });
    expect(preference.openToGuidance).toBe(true);
    expect(preference.communicationStyles).toHaveLength(0);

    await forget(request.sessionId);
  });

  it('stores an intake with no closing note at all', async () => {
    await forgetAll();
    const request: IntakeRequest = {
      ...VALID,
      sessionId: randomUUID(),
      submissionId: randomUUID(),
      rawText: '',
      availability: null,
    };

    await repository.submit(request);

    const intake = await prisma.intake.findFirstOrThrow();
    expect(intake.rawText).toBe('');
    expect(await prisma.clientAvailability.count()).toBe(0);

    await forget(request.sessionId);
  });

  it('leaves no client availability when the windows list is empty', async () => {
    await forgetAll();
    const request: IntakeRequest = {
      ...VALID,
      sessionId: randomUUID(),
      submissionId: randomUUID(),
      availability: { timezone: 'Europe/London', windows: [] },
    };

    await repository.submit(request);

    expect(await prisma.clientAvailability.count()).toBe(0);

    await forget(request.sessionId);
  });
});

describe('submitting twice', () => {
  it('stores one intake and returns the same receipt, however many times it is sent', async () => {
    await forgetAll();
    const request: IntakeRequest = {
      ...VALID,
      sessionId: randomUUID(),
      submissionId: randomUUID(),
    };

    const first = await repository.submit(request);
    const second = await repository.submit(request);
    const third = await repository.submit(request);

    expect(second.intakeId).toBe(first.intakeId);
    expect(third.intakeId).toBe(first.intakeId);
    expect(await prisma.intake.count()).toBe(1);
    expect(await prisma.clientPreference.count()).toBe(1);

    await forget(request.sessionId);
  });

  it('survives two submissions arriving at once', async () => {
    await forgetAll();
    const request: IntakeRequest = {
      ...VALID,
      sessionId: randomUUID(),
      submissionId: randomUUID(),
    };

    // A double click, or a retry that raced the first attempt.
    const results = await Promise.allSettled([
      repository.submit(request),
      repository.submit(request),
    ]);

    const receipts = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value.intakeId);

    expect(receipts.length).toBeGreaterThan(0);
    expect(new Set(receipts).size).toBe(1);
    expect(await prisma.intake.count()).toBe(1);

    await forget(request.sessionId);
  });
});

describe('the API against a real database', () => {
  it('serves the vocabulary and stores an intake end to end', async () => {
    await forgetAll();
    const app = buildApp({ intakes: repository });

    const vocabulary = await app.inject({
      method: 'GET',
      url: '/api/v1/intake/vocabulary',
    });
    expect(vocabulary.statusCode).toBe(200);

    const sessionId = randomUUID();
    const body: IntakeRequest = { ...VALID, sessionId, submissionId: randomUUID() };

    const stored = await app.inject({ method: 'POST', url: '/api/v1/intakes', payload: body });
    expect(stored.statusCode).toBe(200);

    // The receipt names the row it created, which is not the browser's identifier.
    const intakeId = stored.json<{ intakeId: string }>().intakeId;
    expect(intakeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await prisma.intake.count({ where: { submissionId: body.submissionId } })).toBe(1);

    // The same payload sent again, as a retry would be.
    const retried = await app.inject({ method: 'POST', url: '/api/v1/intakes', payload: body });
    expect(retried.json<{ intakeId: string }>().intakeId).toBe(intakeId);
    expect(await prisma.intake.count()).toBe(1);

    await app.close();
    await forget(sessionId);
  });

  it('rejects a keyword the vocabulary does not contain, without writing anything', async () => {
    await forgetAll();
    const app = buildApp({ intakes: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      payload: { ...VALID, sessionId: randomUUID(), areasOfWork: ['not-in-the-vocabulary'] },
    });

    expect(response.statusCode).toBe(400);
    expect(await prisma.intake.count()).toBe(0);
    expect(await prisma.client.count()).toBe(0);

    await app.close();
  });
});
