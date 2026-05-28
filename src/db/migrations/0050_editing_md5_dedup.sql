-- Migration: add MD5 hash fields + duplicate tracking to editing_task
-- 2026-05-26

ALTER TABLE "editing_task"
  ADD COLUMN IF NOT EXISTS "source_file_hashes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "edited_file_hashes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "is_duplicate" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "duplicate_of" bigint;
