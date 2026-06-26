-- Migration 0005: XPath test cases table + v7.2 security hardening
-- Run this in the Neon SQL Editor (dashboard.neon.tech)

-- 1. xpath_test_cases table (replaces single-config approach)
CREATE TABLE IF NOT EXISTS "xpath_test_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "target_type" varchar(10) DEFAULT 'HTML' NOT NULL,
  "target_payload" text NOT NULL,
  "reference_selector" text NOT NULL,
  "is_hidden" boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_xpath_test_cases_question_id"
  ON "xpath_test_cases" ("question_id");

-- 2. Migrate existing xpath_configs data (if old columns still exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'xpath_configs' AND column_name = 'target_payload'
  ) THEN
    INSERT INTO "xpath_test_cases" ("question_id", "target_type", "target_payload", "reference_selector")
    SELECT
      "question_id",
      COALESCE("target_type", 'HTML'),
      "target_payload",
      COALESCE("reference_xpath", '')
    FROM "xpath_configs"
    WHERE "target_payload" IS NOT NULL AND "reference_xpath" IS NOT NULL;
  END IF;
END $$;

-- 3. Update xpath_configs to new schema (selector_type only)
ALTER TABLE "xpath_configs"
  ADD COLUMN IF NOT EXISTS "selector_type" varchar(10) DEFAULT 'XPATH' NOT NULL;

ALTER TABLE "xpath_configs"
  DROP COLUMN IF EXISTS "target_type",
  DROP COLUMN IF EXISTS "target_payload",
  DROP COLUMN IF EXISTS "reference_xpath";

-- 4. OFE status code
ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'OFE';

-- 5. Focus loss policy on exams
ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "focus_loss_policy" varchar(20) DEFAULT 'LOG_ONLY' NOT NULL;

-- 6. Close reason on exam_submissions
ALTER TABLE "exam_submissions"
  ADD COLUMN IF NOT EXISTS "close_reason" varchar(50);
