ALTER TABLE "editing_task" ADD COLUMN "is_disqualified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "disqualified_reason" text;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "disqualified_by_user_id" text;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "disqualified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_disqualified_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("disqualified_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;