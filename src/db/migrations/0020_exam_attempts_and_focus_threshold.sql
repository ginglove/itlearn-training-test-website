-- Migration 0020: backfill columns that exist in schema.ts / init.sql but had no migration
-- Safe to run repeatedly (IF NOT EXISTS everywhere).

-- Multiple attempts per exam
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "allowed_attempts" integer DEFAULT 1 NOT NULL;
ALTER TABLE "exam_submissions" ADD COLUMN IF NOT EXISTS "attempt" integer DEFAULT 1 NOT NULL;

-- Replace the old one-submission-per-student unique index with a per-attempt one
DROP INDEX IF EXISTS "one_submission_per_student_exam";
CREATE UNIQUE INDEX IF NOT EXISTS "one_submission_per_student_exam_attempt"
  ON "exam_submissions" USING btree ("exam_id", "student_id", "attempt");

-- Per-exam WARN_AND_LOCK threshold
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "focus_loss_threshold" integer DEFAULT 3 NOT NULL;
