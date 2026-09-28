-- The human-in-the-loop matching workspace.
--
-- Four things, and the reasoning for each is on the models themselves. The version worth
-- repeating here is the first: this table is a *new record alongside* the engine's, not an
-- edit to it.
--
-- 1. `matching_decisions` records what a human matcher selected about one pass. It does not
--    modify the `Match` row the engine wrote, and nothing in the engine is retro-fitted to
--    agree with the matcher. So the audit trail is a fact of the schema rather than a promise:
--    the recommended row is still there with its own score and evidence, and the decision sits
--    next to it pointing at a different candidate row.
--
--    `selected_match_id` is a foreign key to `matches` rather than a plain therapist id, which
--    makes three things fall out of the database rather than out of application code:
--      - the person chosen was one the engine actually evaluated for this pass;
--      - "accepted the system suggestion" is literally `match_id = selected_match_id`;
--      - the evidence the client is shown can be read from the selected row.
--
--    It is unique. A candidate row belongs to exactly one pass, so it can be the selection for
--    at most one case; a later pass gets its own row for the same person, because a rematch
--    re-evaluates every candidate. The constraint costs nothing and makes "one candidate was
--    selected for two cases" unwriteable.
--
--    There is no `decided_by` column, on purpose. This prototype has no accounts and no
--    authentication, so any name in that column would be invented — which is faking
--    authentication rather than modelling it. What the record honestly holds is that a human
--    decision was made, and when. See `docs/human-matching.md`.
--
-- 2. `matching_decision_reasons` is a vocabulary, with a stable `key` beside the wording a
--    matcher reads, for the same reason the feedback vocabulary has one: a copywriter should be
--    able to rewrite a sentence without touching a rule.
--
--    A reason is a matcher's stated reason for their own choice. It is not a measurement of
--    either person, and nothing downstream treats it as one.
--
-- 3. `matching_decision_to_reasons` is m:n, because several reasons can be true at once and
--    "better fit for what they asked for" plus "stronger contextual experience" is one answer
--    a matcher can mean.
--
-- 4. Two new one-to-one relations on `matches`, so a pass carries both the row the engine
--    recommended and the row a human selected from that same pass.
--
-- On a populated database and an empty one alike: three new tables, one new enum, and nothing
-- existing is read, rewritten or dropped.
CREATE TYPE "MatchingDecisionType" AS ENUM ('SYSTEM_ACCEPTED', 'HUMAN_SELECTED_ALTERNATIVE');

CREATE TABLE "matching_decisions" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "selectedMatchId" UUID NOT NULL,
    "decisionType" "MatchingDecisionType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "matching_decision_reasons" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "matching_decision_reasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "matching_decision_to_reasons" (
    "decisionId" UUID NOT NULL,
    "reasonId" UUID NOT NULL,

    CONSTRAINT "matching_decision_to_reasons_pkey" PRIMARY KEY ("decisionId","reasonId")
);

CREATE UNIQUE INDEX "matching_decisions_matchId_key" ON "matching_decisions"("matchId");
CREATE UNIQUE INDEX "matching_decisions_selectedMatchId_key" ON "matching_decisions"("selectedMatchId");
CREATE INDEX "matching_decisions_createdAt_idx" ON "matching_decisions"("createdAt");
CREATE UNIQUE INDEX "matching_decision_reasons_key_key" ON "matching_decision_reasons"("key");
CREATE INDEX "matching_decision_to_reasons_reasonId_idx" ON "matching_decision_to_reasons"("reasonId");

ALTER TABLE "matching_decisions" ADD CONSTRAINT "matching_decisions_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "matching_decisions" ADD CONSTRAINT "matching_decisions_selectedMatchId_fkey" FOREIGN KEY ("selectedMatchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "matching_decision_to_reasons" ADD CONSTRAINT "matching_decision_to_reasons_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "matching_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "matching_decision_to_reasons" ADD CONSTRAINT "matching_decision_to_reasons_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "matching_decision_reasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
