-- Existing employees intentionally remain NULL: last sync and batch migration times
-- cannot establish their first import or historical departure dates.
ALTER TABLE dingtalk_user ADD COLUMN IF NOT EXISTS first_synced_at timestamptz;
--> statement-breakpoint
ALTER TABLE dingtalk_user ADD COLUMN IF NOT EXISTS last_inactive_at timestamptz;
