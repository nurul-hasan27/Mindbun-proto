-- Feedback-informed rematching: the record of someone saying "this did not fit".
--
-- Four changes, all of which have to work on a populated database and on an empty one.
--
-- 1. `Match.attempt`. An intake can now be evaluated more than once, because asking
--    for another option is a thing the product does. The unique index moves from
--    `(intakeId, therapistId)` to `(intakeId, attempt, therapistId)`, so a candidate is
--    evaluated at most once per *pass* rather than once ever, and the duplicate-safety
--    guarantee is unchanged in kind — a retry still cannot write twice.
--
-- 2. `MatchStatus.DECLINED`, the one new state. `SUPERSEDED` is deliberately absent: a
--    match that was offered and turned down is declined, not superseded, and a
--    candidate that simply lost an ordering is still eligible. Nothing reaches those
--    states, so they are not modelled.
--
-- 3. `Feedback` is rebuilt around a match. It gains `intakeId` and a unique `matchId`,
--    so feedback can never be detached from the decision it responds to and read as a
--    general opinion of a person. Its single `reasonId` becomes a join table, because
--    "the timing didn't work and I didn't feel understood" is one thing a person can
--    mean and forcing them to pick the half that mattered more would lose it.
--
--    Its `sentiment` column — `GOOD | MIXED | POOR` — is removed rather than migrated.
--    A rating of a therapist is the thing this product argues against, `POOR` is a
--    verdict rather than a report of someone's experience, and the column is not
--    referenced anywhere in the code. `DROP TYPE "MatchSentiment"` is safe for the same
--    reason: it is unused in the database too, since only the reason vocabulary is
--    seeded.
--
-- 4. The join table is `feedback_to_reasons`, not `feedback_reasons`, which is taken by
--    the vocabulary itself.
--
-- Note on `attempt` and ordering: this table's primary key is a plain `uuid`, so a
-- re-seeded dataset gets new therapist ids and old matches cascade away with their
-- intake. `attempt` needs no backfill — the single column default of 1 gives every
-- existing row the one pass it belongs to.
-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'DECLINED';

-- DropForeignKey
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_reasonId_fkey";

-- DropIndex
DROP INDEX "matches_intakeId_therapistId_key";

-- AlterTable
ALTER TABLE "feedback" DROP COLUMN "reasonId",
DROP COLUMN "sentiment",
ADD COLUMN     "feedbackReasonId" UUID,
ADD COLUMN     "intakeId" UUID NOT NULL,
ADD COLUMN     "matchId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1;

-- DropEnum
DROP TYPE "MatchSentiment";

-- CreateTable
CREATE TABLE "feedback_to_reasons" (
    "feedbackId" UUID NOT NULL,
    "reasonId" UUID NOT NULL,

    CONSTRAINT "feedback_to_reasons_pkey" PRIMARY KEY ("feedbackId","reasonId")
);

-- CreateIndex
CREATE INDEX "feedback_to_reasons_reasonId_idx" ON "feedback_to_reasons"("reasonId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_matchId_key" ON "feedback"("matchId");

-- CreateIndex
CREATE INDEX "feedback_intakeId_createdAt_idx" ON "feedback"("intakeId", "createdAt");

-- CreateIndex
CREATE INDEX "matches_intakeId_attempt_idx" ON "matches"("intakeId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "matches_intakeId_attempt_therapistId_key" ON "matches"("intakeId", "attempt", "therapistId");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_feedbackReasonId_fkey" FOREIGN KEY ("feedbackReasonId") REFERENCES "feedback_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_to_reasons" ADD CONSTRAINT "feedback_to_reasons_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_to_reasons" ADD CONSTRAINT "feedback_to_reasons_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "feedback_reasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

