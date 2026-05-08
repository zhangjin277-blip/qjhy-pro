CREATE TABLE "kuaishou_live_session" (
	"live_stream_id" bigint PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"title" text,
	"cover_url" text,
	"live_type" text,
	"broker_name_raw" text,
	"fans_cnt" integer,
	"start_datetime" timestamp NOT NULL,
	"end_datetime" timestamp,
	"duration_ms" integer,
	"valid_play_uv" integer,
	"max_concurrent_uv" integer,
	"follow_cnt" integer,
	"like_cnt" integer,
	"comment_cnt" integer,
	"live_amt" double precision,
	"valid_play_rate" text,
	"people_avg_duration_ms" integer,
	"fans_rate" text,
	"send_gift_uv" integer,
	"net_follow_user_num" integer,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kuaishou_live_session" ADD CONSTRAINT "kuaishou_live_session_member_id_kuaishou_member_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."kuaishou_member"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_live_session_member" ON "kuaishou_live_session" ("member_id");
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_live_session_start" ON "kuaishou_live_session" ("start_datetime");
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_live_session_member_start" ON "kuaishou_live_session" ("member_id", "start_datetime");
