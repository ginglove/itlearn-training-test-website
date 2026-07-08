-- Migration 0018: support open-ended (TEXT) questions with manual teacher grading

-- Add TEXT to the question_type enum
ALTER TYPE "question_type" ADD VALUE IF NOT EXISTS 'TEXT';

-- Student's typed answer for TEXT questions
ALTER TABLE "submission_details" ADD COLUMN IF NOT EXISTS "text_answer" text;

-- Who graded and when (null = not yet graded / auto-graded)
ALTER TABLE "submission_details" ADD COLUMN IF NOT EXISTS "graded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "submission_details" ADD COLUMN IF NOT EXISTS "graded_at" timestamptz;
