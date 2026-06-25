-- Migration: Add XPATH question type and supporting tables
-- Run this against the live database to add XPath support.

-- 1. Add XPATH to the question_type enum (safe: only adds, does not drop)
ALTER TYPE "public"."question_type" ADD VALUE IF NOT EXISTS 'XPATH';

-- 2. Add xpath_configs table
CREATE TABLE IF NOT EXISTS "xpath_configs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "question_id" uuid NOT NULL,
    "target_type" varchar(10) DEFAULT 'URL' NOT NULL,
    "target_payload" text NOT NULL,
    "reference_xpath" text NOT NULL,
    CONSTRAINT "xpath_configs_question_id_unique" UNIQUE("question_id"),
    CONSTRAINT "xpath_configs_question_id_questions_id_fk"
        FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action
);

-- 3. Add student_xpath column to submission_details
ALTER TABLE "submission_details" ADD COLUMN IF NOT EXISTS "student_xpath" text;
