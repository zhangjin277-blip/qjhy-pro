ALTER TABLE "editing_task" ADD COLUMN "source_file_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "edited_file_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "is_duplicate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "duplicate_of" bigint;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "deleted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_deleted_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;