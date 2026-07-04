-- Migration 0008: Workspace module tables (RSD Workspace Module, Section 3)
DO $$ BEGIN
  CREATE TYPE "workspace_status" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "activity_type" AS ENUM ('EXERCISE', 'HOMEWORK', 'ASSESSMENT', 'QUIZ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(150) NOT NULL,
  "description" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" workspace_status NOT NULL DEFAULT 'ACTIVE',
  "total_days" integer,
  "start_date" timestamptz,
  "end_date" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "workspace_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "status" membership_status NOT NULL DEFAULT 'ACTIVE'
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_workspace_student" ON "workspace_memberships" ("workspace_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_memberships_student" ON "workspace_memberships" ("student_id");

CREATE TABLE IF NOT EXISTS "workspace_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "exam_id" uuid REFERENCES "exams"("id") ON DELETE CASCADE,
  "activity_type" activity_type NOT NULL,
  "title" varchar(150) NOT NULL,
  "description" text,
  "due_date" timestamptz,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  "teaching_day_id" uuid
);
CREATE INDEX IF NOT EXISTS "idx_workspace_activities_exam" ON "workspace_activities" ("exam_id");
