ALTER TABLE "people_performance_profile"
  ADD COLUMN IF NOT EXISTS "probation_goal_template" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "performance_goal_template" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Probation is assessed by the direct manager only. Existing in-flight records
-- return to the direct-manager stage so they can continue under the new rule.
UPDATE "performance_cycle"
SET "skip_manager_user_id" = NULL,
    "stage" = CASE
      WHEN "stage" = 'skip_manager_review' THEN 'manager_review'
      ELSE "stage"
    END,
    "updated_at" = now()
WHERE "kind" = 'probation';
