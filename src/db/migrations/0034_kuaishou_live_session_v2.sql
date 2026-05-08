-- 重建 kuaishou_live_session：双数据源融合（today + history）+ data_source 标识
-- 旧表（0032 + 0033）只装了测试数据，drop 重来。

DROP TABLE IF EXISTS "kuaishou_live_session" CASCADE;

CREATE TABLE "kuaishou_live_session" (
	"live_stream_id" bigint PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"member_name" text,
	"head_img" text,
	"broker_id" bigint,
	"broker_name" text,
	"fans_cnt" integer,
	"live_type" text,
	"title" text,
	"cover_url" text,
	"live_detail" text,
	"start_datetime" timestamp NOT NULL,
	"end_datetime" timestamp,
	"live_duration_text" text,
	"live_duration_ms" bigint,
	"play_uv" integer,
	"play_user_cnt" integer,
	"max_concurrent_user_num" integer,
	"valid_acu" double precision,
	"play_rate" text,
	"per_play_time_avg_text" text,
	"per_play_time_avg_ms" bigint,
	"valid_play_duration_avg_text" text,
	"live_cover_ctr" text,
	"add_fans_cnt" integer,
	"follow_author_num" integer,
	"cancel_follow_author_num" integer,
	"transfer_fans_rate" text,
	"fans_club_cnt" integer,
	"like_cnt" integer,
	"like_rate" text,
	"like_uv" integer,
	"comment_cnt" integer,
	"comment_rate" text,
	"comment_uv" integer,
	"share_cnt" integer,
	"share_rate" text,
	"share_uv" integer,
	"interact_num" integer,
	"interact_rate" text,
	"send_gift_uv" integer,
	"sent_gift_cnt" integer,
	"live_amt" double precision,
	"live_video_amt" double precision,
	"live_chat_room_amt" double precision,
	"report_num" integer,
	"report_rate" text,
	"today_extra" jsonb,
	"data_source" text NOT NULL,
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
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_live_session_data_source" ON "kuaishou_live_session" ("data_source");
