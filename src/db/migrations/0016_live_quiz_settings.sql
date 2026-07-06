-- Migration 0016: live quiz settings — pacing mode, answer reveal, shuffling

ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "mode" varchar(10) NOT NULL DEFAULT 'TEACHER';
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "show_correct_answer" boolean NOT NULL DEFAULT true;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "shuffle_questions" boolean NOT NULL DEFAULT false;
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "shuffle_options" boolean NOT NULL DEFAULT false;
-- Question ids in play order, frozen at session creation (supports shuffling)
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "question_order" text[] NOT NULL DEFAULT '{}';

-- Per-student progress for student-paced sessions
ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "current_question_index" integer NOT NULL DEFAULT 0;
ALTER TABLE "live_participants" ADD COLUMN IF NOT EXISTS "finished_at" timestamptz;
