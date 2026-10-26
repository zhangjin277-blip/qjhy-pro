ALTER TABLE business_goal ADD COLUMN IF NOT EXISTS weight double precision;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_goal_weight_range' AND conrelid = 'business_goal'::regclass) THEN
    ALTER TABLE business_goal ADD CONSTRAINT business_goal_weight_range CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100));
  END IF;
END $$;
