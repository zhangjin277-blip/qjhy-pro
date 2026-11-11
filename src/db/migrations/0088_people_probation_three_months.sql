-- Expand the legacy check created by drizzle/0059_people_performance.sql.
ALTER TABLE "people_performance_profile"
  DROP CONSTRAINT IF EXISTS "people_performance_profile_probation_months_check";
--> statement-breakpoint
ALTER TABLE "people_performance_profile"
  ADD CONSTRAINT "people_performance_profile_probation_months_check"
  CHECK ("probation_months" IN (2, 3, 6));
