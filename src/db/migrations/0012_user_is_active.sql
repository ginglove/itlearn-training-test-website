-- Migration 0012: account activation flag (admin can deactivate users)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
