ALTER TABLE "business_recruitment_candidate"
  ADD COLUMN IF NOT EXISTS "appearance_note" text,
  ADD COLUMN IF NOT EXISTS "voice_note" text,
  ADD COLUMN IF NOT EXISTS "expression_note" text,
  ADD COLUMN IF NOT EXISTS "internet_sense_note" text,
  ADD COLUMN IF NOT EXISTS "resilience_note" text;
