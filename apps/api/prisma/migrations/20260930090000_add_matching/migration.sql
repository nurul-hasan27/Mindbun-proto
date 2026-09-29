-- Explainable matching: the engine's entire reasoning, persisted.
--
-- Two new tables and three new enums, all additive — nothing existing is
-- altered, so this applies to a populated database and an empty one alike.
--
-- `matches` is one row per candidate the engine evaluated, including the ones it
-- set aside and why; `match_evidence` is the structured reason behind each of
-- those decisions. Neither table stores a generated sentence: an explanation is
-- a function of the evidence keys, so stored matches always read in the current
-- wording and can never claim something the evidence does not support.
--
-- The unique index on (intakeId, therapistId) is the whole of the
-- duplicate-submission safety: an intake is evaluated once, and a retry cannot
-- write a second set of rows.
--
-- docs/matching-engine.md explains what every column is for.
-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ELIGIBLE', 'INELIGIBLE', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "MatchCategory" AS ENUM ('AREA_OF_WORK', 'LANGUAGE', 'COMMUNICATION_STYLE', 'THERAPEUTIC_APPROACH', 'CONTEXTUAL_EXPERIENCE', 'SESSION_FORMAT', 'AVAILABILITY');

-- CreateEnum
CREATE TYPE "MatchExplanation" AS ENUM ('REQUIRED_LANGUAGE', 'PREFERRED_LANGUAGE', 'AREA_OF_WORK', 'COMMUNICATION_STYLE', 'THERAPEUTIC_APPROACH', 'CONTEXTUAL_EXPERIENCE', 'SESSION_FORMAT', 'AVAILABILITY_OVERLAP');

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "intakeId" UUID NOT NULL,
    "therapistId" UUID NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "rejectionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_evidence" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "category" "MatchCategory" NOT NULL,
    "kind" "PreferenceKind" NOT NULL,
    "clientKey" TEXT NOT NULL,
    "therapistKey" TEXT NOT NULL,
    "explanation" "MatchExplanation" NOT NULL,
    "weight" INTEGER NOT NULL,
    "overlapDayOfWeek" "DayOfWeek",
    "overlapStartMinute" INTEGER,
    "overlapEndMinute" INTEGER,
    "therapistOverlapDayOfWeek" "DayOfWeek",
    "therapistOverlapStartMinute" INTEGER,
    "therapistOverlapEndMinute" INTEGER,
    "seasonal" INTEGER NOT NULL DEFAULT 0,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "match_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_intakeId_status_idx" ON "matches"("intakeId", "status");

-- CreateIndex
CREATE INDEX "matches_clientId_createdAt_idx" ON "matches"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "matches_therapistId_idx" ON "matches"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_intakeId_therapistId_key" ON "matches"("intakeId", "therapistId");

-- CreateIndex
CREATE INDEX "match_evidence_matchId_ordinal_idx" ON "match_evidence"("matchId", "ordinal");

-- CreateIndex
CREATE INDEX "match_evidence_explanation_idx" ON "match_evidence"("explanation");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_evidence" ADD CONSTRAINT "match_evidence_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

