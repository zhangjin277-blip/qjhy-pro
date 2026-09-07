-- Dual-manager performance review workflow.
ALTER TABLE "people_performance_profile"
  ADD COLUMN IF NOT EXISTS "skip_manager_user_id" text REFERENCES "dingtalk_user"("user_id");

CREATE INDEX IF NOT EXISTS "idx_people_performance_profile_skip_manager"
  ON "people_performance_profile" ("skip_manager_user_id");

ALTER TABLE "performance_cycle"
  ADD COLUMN IF NOT EXISTS "skip_manager_user_id" text REFERENCES "dingtalk_user"("user_id"),
  ADD COLUMN IF NOT EXISTS "requires_final_review" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "skip_manager_summary" text;

ALTER TABLE "performance_goal"
  ADD COLUMN IF NOT EXISTS "skip_manager_score" numeric(5,2),
  ADD COLUMN IF NOT EXISTS "skip_manager_comment" text;

-- Existing profiles fall back to their direct manager until HR confirms the skip-level manager.
UPDATE "people_performance_profile"
SET "skip_manager_user_id" = "manager_user_id"
WHERE "skip_manager_user_id" IS NULL
  AND "manager_user_id" IS NOT NULL;

-- Existing cycles inherit the newly configured skip-level manager.
UPDATE "performance_cycle" c
SET "skip_manager_user_id" = p."skip_manager_user_id"
FROM "people_performance_profile" p
WHERE p."user_id" = c."user_id"
  AND c."skip_manager_user_id" IS NULL;

-- Preserve historical results: the old single-manager assessment seeds both roles.
UPDATE "performance_goal"
SET "skip_manager_score" = "manager_score",
    "skip_manager_comment" = "manager_comment"
WHERE "manager_score" IS NOT NULL
  AND "skip_manager_score" IS NULL;

UPDATE "performance_cycle"
SET "skip_manager_summary" = "manager_summary"
WHERE "manager_summary" IS NOT NULL
  AND "skip_manager_summary" IS NULL;

-- Six-month probation checkpoints 1 and 3 finish after skip-level evaluation.
-- Use the immutable cycle label instead of the current profile setting because
-- HR may have changed the probation type after an older cycle was generated.
UPDATE "performance_cycle"
SET "requires_final_review" = true
WHERE "kind" = 'probation';

UPDATE "performance_cycle"
SET "requires_final_review" = false
WHERE "kind" = 'probation'
  AND "label" LIKE '6个月试用期·%'
  AND "sequence" IN (1, 2);

-- Close old early checkpoints that had already entered calibration/confirmation.
WITH totals AS (
  SELECT
    g."cycle_id",
    ROUND(SUM(g."manager_score") * 0.4 + SUM(g."skip_manager_score") * 0.6, 2) AS score
  FROM "performance_goal" g
  GROUP BY g."cycle_id"
)
UPDATE "performance_cycle" c
SET "stage" = 'completed',
    "final_score" = t.score,
    "final_grade" = CASE
      WHEN t.score >= 95 THEN 'S'
      WHEN t.score >= 85 THEN 'A'
      WHEN t.score >= 70 THEN 'B'
      WHEN t.score >= 60 THEN 'C'
      ELSE 'D'
    END,
    "probation_result" = NULL,
    "confirmed_at" = NULL,
    "completed_at" = COALESCE(c."completed_at", now()),
    "updated_at" = now()
FROM totals t
WHERE t."cycle_id" = c."id"
  AND c."requires_final_review" = false
  AND c."stage" IN ('hr_calibration', 'employee_confirm');
