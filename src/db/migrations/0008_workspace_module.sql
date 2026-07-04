-- Workspace (Class) Management Module — RSD_Workspace_Module_Requirements.md v1.0

CREATE TYPE "workspace_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE "activity_type" AS ENUM ('EXERCISE', 'HOMEWORK', 'ASSESSMENT', 'QUIZ');

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(150) NOT NULL,
  "description" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "workspace_status" NOT NULL DEFAULT 'ACTIVE',
  "total_days" integer NOT NULL DEFAULT 0,
  "start_date" date,
  "end_date" date,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_workspaces_created_by" ON "workspaces" ("created_by");

CREATE TABLE IF NOT EXISTS "workspace_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_workspace_student" ON "workspace_memberships" ("workspace_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_memberships_workspace" ON "workspace_memberships" ("workspace_id");

CREATE TABLE IF NOT EXISTS "teaching_days" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "day_number" integer NOT NULL,
  "scheduled_date" date NOT NULL,
  "topic" varchar(200),
  "notes" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_workspace_day_number" ON "teaching_days" ("workspace_id", "day_number");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_workspace_day_date" ON "teaching_days" ("workspace_id", "scheduled_date");

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teaching_day_id" uuid NOT NULL REFERENCES "teaching_days"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "attendance_status" NOT NULL,
  "note" text,
  "recorded_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_day_student_attendance" ON "attendance_records" ("teaching_day_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_attendance_student" ON "attendance_records" ("student_id");

CREATE TABLE IF NOT EXISTS "workspace_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "exam_id" uuid REFERENCES "exams"("id") ON DELETE CASCADE,
  "teaching_day_id" uuid REFERENCES "teaching_days"("id") ON DELETE SET NULL,
  "activity_type" "activity_type" NOT NULL,
  "title" varchar(150) NOT NULL,
  "description" text,
  "due_date" timestamptz,
  "assigned_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "unique_workspace_exam" ON "workspace_activities" ("workspace_id", "exam_id");
CREATE INDEX IF NOT EXISTS "idx_activities_workspace" ON "workspace_activities" ("workspace_id");

CREATE TABLE IF NOT EXISTS "workspace_class_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "generated_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "total_scheduled_days" integer NOT NULL DEFAULT 0,
  "total_conducted_days" integer NOT NULL DEFAULT 0,
  "report_data" json
);
CREATE INDEX IF NOT EXISTS "idx_reports_workspace" ON "workspace_class_reports" ("workspace_id");
