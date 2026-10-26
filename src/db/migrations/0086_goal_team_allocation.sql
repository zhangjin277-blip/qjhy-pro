-- Team/individual allocation is independent of quarterly/monthly allocation.
ALTER TABLE business_goal ADD COLUMN IF NOT EXISTS team_parent_id text REFERENCES business_goal(id);
CREATE INDEX IF NOT EXISTS idx_business_goal_team_parent ON business_goal(team_parent_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_goal_team_not_self' AND conrelid = 'business_goal'::regclass) THEN
    ALTER TABLE business_goal ADD CONSTRAINT business_goal_team_not_self CHECK (id IS DISTINCT FROM team_parent_id);
  END IF;
END $$;
