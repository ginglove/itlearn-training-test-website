-- Migration 0019: support all question types in live quiz sessions
-- Adds text_answer column to live_answers for TEXT/open-ended responses

ALTER TABLE "live_answers" ADD COLUMN IF NOT EXISTS "text_answer" text;
