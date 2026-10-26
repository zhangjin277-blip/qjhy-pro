ALTER TABLE business_goal ADD COLUMN IF NOT EXISTS binding jsonb;
-- Existing drafts retain their original metric definitions. Do not infer account scope or overwrite them.
