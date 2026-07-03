ALTER TABLE "exam_submissions" ADD COLUMN IF NOT EXISTS "active_seconds" integer NOT NULL DEFAULT 0;
