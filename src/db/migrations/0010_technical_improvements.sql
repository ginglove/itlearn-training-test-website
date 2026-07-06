-- Migration 0010: technical improvements (RSD_improvement_technical.md)
-- 1. Heartbeat column for server-side activeSeconds verification
-- 2. Standalone activity attempts table (text-based EXERCISE/HOMEWORK submissions)

ALTER TABLE "exam_submissions"
  ADD COLUMN IF NOT EXISTS "active_seconds_updated_at" timestamptz;

CREATE TABLE IF NOT EXISTS "workspace_activity_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "activity_id" uuid NOT NULL REFERENCES "workspace_activities"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "text_response" text NOT NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "score_percentage" numeric(5,2)
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_activity_student_attempt" ON "workspace_activity_attempts" ("activity_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_activity_attempts_student" ON "workspace_activity_attempts" ("student_id");
