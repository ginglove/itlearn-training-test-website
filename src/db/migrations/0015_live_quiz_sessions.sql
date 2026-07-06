-- Migration 0015: live quiz sessions (realtime hosted quiz with leaderboard)

CREATE TABLE IF NOT EXISTS "live_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exam_id" uuid NOT NULL REFERENCES "exams"("id") ON DELETE CASCADE,
  "host_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "join_code" varchar(8) NOT NULL,
  "status" varchar(12) NOT NULL DEFAULT 'LOBBY',
  "current_question_index" integer NOT NULL DEFAULT -1,
  "question_started_at" timestamptz,
  "question_seconds" integer NOT NULL DEFAULT 30,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_live_join_code" ON "live_sessions" ("join_code");
CREATE INDEX IF NOT EXISTS "idx_live_sessions_host" ON "live_sessions" ("host_id");

CREATE TABLE IF NOT EXISTS "live_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "live_sessions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "score" integer NOT NULL DEFAULT 0,
  "joined_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_live_participant" ON "live_participants" ("session_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_live_participants_session" ON "live_participants" ("session_id");

CREATE TABLE IF NOT EXISTS "live_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "live_sessions"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "selected_options" text[] DEFAULT '{}',
  "is_correct" boolean NOT NULL DEFAULT false,
  "points" integer NOT NULL DEFAULT 0,
  "answered_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_live_answer" ON "live_answers" ("session_id", "question_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_live_answers_session_question" ON "live_answers" ("session_id", "question_id");
