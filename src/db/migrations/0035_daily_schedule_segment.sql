CREATE TABLE "daily_schedule_segment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" text NOT NULL,
  "date" date NOT NULL,
  "dingtalk_user_id" text NOT NULL,
  "start_hour" integer NOT NULL,
  "end_hour" integer NOT NULL,
  "is_rest" boolean DEFAULT false NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "reason" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_schedule_segment_hours_check" CHECK ("start_hour" >= 0 AND "start_hour" < "end_hour" AND "end_hour" <= 28)
);
--> statement-breakpoint
ALTER TABLE "daily_schedule_segment" ADD CONSTRAINT "daily_schedule_segment_account_id_live_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."live_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_schedule_segment" ADD CONSTRAINT "daily_schedule_segment_dingtalk_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("dingtalk_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_schedule_segment" ADD CONSTRAINT "daily_schedule_segment_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "daily_schedule_segment_account_date_idx" ON "daily_schedule_segment" ("account_id", "date");
--> statement-breakpoint
CREATE INDEX "daily_schedule_segment_user_date_idx" ON "daily_schedule_segment" ("dingtalk_user_id", "date");
