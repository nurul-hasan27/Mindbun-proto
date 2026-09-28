-- Drop the stray `feedbackReasonId` column.
--
-- A correction to the previous migration, recorded rather than rewritten. The first
-- attempt carried a leftover scalar relation alongside the new join table, which
-- `prisma format` had re-added automatically when the m:n side was introduced: the
-- old `FeedbackReason.feedback Feedback[]` field was still present, so its opposite
-- was required. Both the field and its column are gone now.
--
-- The column was nullable and had no rows, so this is a clean drop on a populated
-- database and an empty one alike. Nothing reads it: the reason list is the join
-- table, which is what allows someone to say two things at once.
--
-- `feedback_reasonId_fkey` is dropped first because the column cannot go while a
-- constraint depends on it.
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_feedbackReasonId_fkey";

ALTER TABLE "feedback" DROP COLUMN "feedbackReasonId";
