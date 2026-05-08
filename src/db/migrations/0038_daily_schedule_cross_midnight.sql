ALTER TABLE "daily_schedule_segment" DROP CONSTRAINT IF EXISTS "daily_schedule_segment_hours_check";
--> statement-breakpoint
ALTER TABLE "daily_schedule_segment" ADD CONSTRAINT "daily_schedule_segment_hours_check"
  CHECK ("start_hour" >= 0 AND "start_hour" <= 27 AND "end_hour" >= 1 AND "end_hour" <= 28 AND "start_hour" < "end_hour");
