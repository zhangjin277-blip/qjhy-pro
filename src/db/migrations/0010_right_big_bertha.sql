CREATE TABLE "editing_task" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"live_account_id" text NOT NULL,
	"anchor_id" text,
	"material_date" timestamp NOT NULL,
	"status" text NOT NULL,
	"source_remark" text,
	"source_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_file_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_uploaded_at" timestamp with time zone,
	"editor_user_id" text,
	"editing_started_at" timestamp with time zone,
	"edited_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_file_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_uploaded_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"published_by_user_id" text,
	"published_at" timestamp with time zone,
	"video_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editing_task_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_live_account_id_live_account_id_fk" FOREIGN KEY ("live_account_id") REFERENCES "public"."live_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_anchor_id_anchor_profile_anchor_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."anchor_profile"("anchor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_editor_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_reviewed_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_published_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task" ADD CONSTRAINT "editing_task_created_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task_event" ADD CONSTRAINT "editing_task_event_task_id_editing_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."editing_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editing_task_event" ADD CONSTRAINT "editing_task_event_actor_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_editing_task_status_date" ON "editing_task" USING btree ("status","material_date");--> statement-breakpoint
CREATE INDEX "idx_editing_task_account_date" ON "editing_task" USING btree ("live_account_id","material_date");--> statement-breakpoint
CREATE INDEX "idx_editing_task_editor_status" ON "editing_task" USING btree ("editor_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_editing_task_video_id" ON "editing_task" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_editing_event_task_created" ON "editing_task_event" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_editing_event_type_created" ON "editing_task_event" USING btree ("event_type","created_at");