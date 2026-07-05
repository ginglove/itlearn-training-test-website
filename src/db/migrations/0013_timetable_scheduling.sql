-- Migration 0013: timetable auto-generation + teacher absence tracking
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "schedule_days" integer[];
ALTER TABLE "teaching_days" ADD COLUMN IF NOT EXISTS "teacher_absent" boolean NOT NULL DEFAULT false;
