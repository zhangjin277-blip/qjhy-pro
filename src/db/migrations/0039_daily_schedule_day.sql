CREATE TABLE "daily_schedule_day" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" text NOT NULL,
  "date" date NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_schedule_day_account_date_unique" UNIQUE("account_id", "date")
);
--> statement-breakpoint
ALTER TABLE "daily_schedule_day" ADD CONSTRAINT "daily_schedule_day_account_id_live_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."live_account"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_schedule_day" ADD CONSTRAINT "daily_schedule_day_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "daily_schedule_day_account_date_idx" ON "daily_schedule_day" ("account_id", "date");
