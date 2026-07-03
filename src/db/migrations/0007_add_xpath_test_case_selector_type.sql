-- Migration 0007: Add selector_type to xpath_test_cases
ALTER TABLE "xpath_test_cases" ADD COLUMN IF NOT EXISTS "selector_type" varchar(10) DEFAULT 'XPATH' NOT NULL;
