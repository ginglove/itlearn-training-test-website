-- Migration 0009: Multi-tier admin governance (RSD v9.0 §2, §3)

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'ADMIN' BEFORE 'TEACHER';

CREATE TABLE IF NOT EXISTS "workspace_teachers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "teacher_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assigned_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_workspace_teacher" ON "workspace_teachers" ("workspace_id", "teacher_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_teachers_teacher" ON "workspace_teachers" ("teacher_id");

-- Existing workspace creators keep access as implicit assignees
INSERT INTO "workspace_teachers" ("workspace_id", "teacher_id")
SELECT w."id", w."created_by" FROM "workspaces" w
JOIN "users" u ON u."id" = w."created_by" AND u."role" = 'TEACHER'
ON CONFLICT DO NOTHING;
