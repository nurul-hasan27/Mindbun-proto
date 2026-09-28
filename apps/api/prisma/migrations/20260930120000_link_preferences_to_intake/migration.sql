-- Link a preference set to the intake whose answers produced it.
--
-- Additive and nullable, so it applies to a populated database and an empty one
-- alike. Existing preference sets keep a null `intakeId`; the matching repository
-- falls back to the client's most recent set for those, which is what it would
-- have used before this column existed.
--
-- The column exists because a timestamp cannot do this job. Phase 4 replaces a
-- client's single preference set on every submission, so an older intake's answers
-- are gone, and two intakes written in the same millisecond are ordered
-- arbitrarily. Storing the link is what lets an older intake be explained by its
-- own answers rather than by a newer, different set.
--
-- ON DELETE SET NULL rather than CASCADE: deleting someone's intake should not
-- silently delete the preferences it produced, because the preferences are what a
-- future recommendation actually reads.
-- AlterTable
ALTER TABLE "client_preferences" ADD COLUMN     "intakeId" UUID;

-- CreateIndex
CREATE INDEX "client_preferences_intakeId_idx" ON "client_preferences"("intakeId");

-- AddForeignKey
ALTER TABLE "client_preferences" ADD CONSTRAINT "client_preferences_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

