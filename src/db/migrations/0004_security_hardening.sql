-- Migration: Security Hardening (RSD_improvement.md items 1.2, 2.1)

-- 1.2: Add OFE to execution_status enum
ALTER TYPE "public"."execution_status" ADD VALUE IF NOT EXISTS 'OFE';

-- 2.1: Add focus_loss_policy to exams
ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "focus_loss_policy" varchar(20) DEFAULT 'LOG_ONLY' NOT NULL;

-- 2.1: Add close_reason to exam_submissions
ALTER TABLE "exam_submissions"
  ADD COLUMN IF NOT EXISTS "close_reason" varchar(50);
