import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { buildAppWithStore } from '../src/app.js';
import type { DayName } from '../src/data/dayOfWeek.js';

/**
 * A demo case for the matching workspace.
 *
 * ## Why this is a separate command and not part of the seed
 *
 * The base seed creates therapists and vocabularies and nothing else — no clients, no
 * intakes, no matches — because those are a person's data, and a repository of invented
 * people should not contain invented *clients* unless somebody asks for them. A
 * reviewer's queue is empty on a fresh database, though, and an internal tool nobody has
 * ever opened is not a demonstrated internal tool.
 *
 * So this is a separate, explicitly-run, idempotent command.
 *
 * ## Why it goes through the HTTP routes rather than writing rows
 *
 * Because that is the only way to be sure the demo is a real one. The intake is submitted
 * through `POST /api/v1/intakes` and the match is created through `POST /api/v1/matches` —
 * the real routes, in-process via `app.inject`. Nothing here writes a `Match`, an
 * `Intake` or a `ClientPreference` by hand, so the case in the queue is exactly the case a
 * browser would have produced, and it cannot drift from the product the way a bespoke
 * script eventually does.
 *
 * ## The scenario
 *
 * The strongest signals the demo intake can produce: **Hindi and English, exploratory
 * conversation, the Indian diaspora, relationships and career transitions, weekday
 * evenings.**
 *
 * The point is the *alternatives*. The engine's suggestion is one person; a reviewer needs
 * a second who is a legitimate candidate with genuinely different strengths — not a worse
 * version of the same thing, and never a strawman. Several seeded therapists carry these
 * attributes, so the shortlist is a real choice, which is the whole argument for having a
 * person in the loop.
 */

/**
 * Fixed identifiers, so the command is idempotent and the demo client is findable.
 *
 * A fixed id rather than a prefix search, because `sessionId` is a `uuid` column and a
 * `startsWith` filter is not a thing a uuid index can answer.
 */
const DEMO_SESSION_ID = '4f2a1b90-0000-4000-8000-000000000001';
const DEMO_SUBMISSION_ID = '4f2a1b90-0000-4000-8000-000000000002';

const SCENARIO = {
  areasOfWork: ['relationships', 'career-transitions'],
  communicationStyles: ['exploratory'],
  contextualExperiences: ['indian-diaspora'],
  languages: ['hi', 'en'],
  sessionFormats: ['online'],
  availability: {
    timezone: 'Asia/Kolkata',
    windows: (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as DayName[]).map(
      (dayOfWeek) => ({ dayOfWeek, startMinute: 17 * 60, endMinute: 21 * 60 }),
    ),
  },
  openToGuidance: false,
  rawText:
    'I have been in the UK for six years and I keep explaining my family to people who have never ' +
    'lived somewhere else. I would rather not do that again, and I would like someone who has had ' +
    'to work it out themselves rather than someone who has read about it.',
};

async function removePreviousDemo(prisma: PrismaClient): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { sessionId: DEMO_SESSION_ID },
    select: { id: true },
  });

  if (client === null) {
    return;
  }

  // Explicit, not by cascade, for the same reason the seed deletes its tables explicitly:
  // reseeding should not depend on cascade behaviour owned by two other tables.
  await prisma.feedbackToReason.deleteMany({ where: { feedback: { clientId: client.id } } });
  await prisma.feedback.deleteMany({ where: { clientId: client.id } });
  await prisma.matchingDecisionToReason.deleteMany({
    where: { decision: { match: { clientId: client.id } } },
  });
  await prisma.matchingDecision.deleteMany({ where: { match: { clientId: client.id } } });
  await prisma.matchEvidence.deleteMany({ where: { match: { clientId: client.id } } });
  await prisma.match.deleteMany({ where: { clientId: client.id } });
  await prisma.clientAvailability.deleteMany({ where: { clientId: client.id } });
  await prisma.clientPreference.deleteMany({ where: { clientId: client.id } });
  await prisma.intake.deleteMany({ where: { clientId: client.id } });
  await prisma.client.delete({ where: { id: client.id } });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const app = buildAppWithStore({ logger: { level: 'silent' } });

try {
  await removePreviousDemo(prisma);

  const intake = await app.inject({
    method: 'POST',
    url: '/api/v1/intakes',
    headers: { 'content-type': 'application/json' },
    payload: { sessionId: DEMO_SESSION_ID, submissionId: DEMO_SUBMISSION_ID, ...SCENARIO },
  });

  if (intake.statusCode !== 200) {
    throw new Error(`the demo intake was refused: ${intake.statusCode} ${intake.body}`);
  }

  const { intakeId } = intake.json<{ intakeId: string }>();

  const match = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: { 'content-type': 'application/json' },
    payload: { intakeId },
  });

  if (match.statusCode !== 200) {
    throw new Error(`the demo match was refused: ${match.statusCode} ${match.body}`);
  }

  const recommendation = match.json<{
    matchId: string;
    therapist: { displayName: string; communicationStyles: { name: string }[] };
    whyThisMatch: { sentence: string }[];
  }>();

  const record = await prisma.match.findUniqueOrThrow({
    where: { id: recommendation.matchId },
    select: {
      id: true,
      score: true,
      _count: { select: { evidence: true } },
    },
  });

  // The engine's own shortlist, in its order, for the message below. Read from storage
  // rather than from the API, because the API deliberately does not expose an ordering —
  // the workspace recovers it internally and never sends it.
  const shortlist = await prisma.match.findMany({
    where: { intakeId, attempt: 1, status: { in: ['ELIGIBLE', 'RECOMMENDED'] } },
    select: { therapist: { select: { profile: { select: { displayName: true } } } }, score: true },
    orderBy: [{ score: 'desc' }, { therapistId: 'asc' }],
    take: 5,
  });

  console.log('\n🗂  A demo case is waiting in the matching workspace.\n');
  console.log('   Client needs   Hindi · English · Relationships · Career transitions');
  console.log('                  Exploratory conversation · Indian diaspora');
  console.log('                  Weekday evenings · Online\n');
  console.log(`   The system suggested  ${recommendation.therapist.displayName}`);
  console.log(
    `                       ${recommendation.therapist.communicationStyles.map((s) => s.name).join(' · ')}`,
  );
  console.log('\n   Why the system suggested them:');
  for (const reason of recommendation.whyThisMatch) {
    console.log(`     · ${reason.sentence}`);
  }
  console.log("\n   Other candidates it considered viable, in the engine's order:");
  const suggestionName = recommendation.therapist.displayName;

  for (const entry of shortlist) {
    // A therapist with no profile cannot appear on any page, so they cannot be a
    // candidate; skipping rather than printing a blank line keeps the list honest.
    const name = entry.therapist.profile?.displayName;

    if (name === undefined || name === suggestionName) {
      continue;
    }

    console.log(`     · ${name}`);
  }
  console.log(`\n   ${record._count.evidence} evidence rows stored for the suggestion.`);
  console.log(`   Case reference: ${record.id}`);
  console.log('\n   Open /matching-workspace to review it.\n');
} finally {
  await app.close();
  await prisma.$disconnect();
}
