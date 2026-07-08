-- Migration 0017: track time taken per answer and total time per participant

-- How long (ms) the student took to answer each question
ALTER TABLE "live_answers" ADD COLUMN IF NOT EXISTS "time_taken_ms" integer NOT NULL DEFAULT 0;

-- Accumulated answer time across all questions (ms) for leaderboard display
ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "total_time_ms" bigint NOT NULL DEFAULT 0;
