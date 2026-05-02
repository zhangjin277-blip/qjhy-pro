CREATE TABLE "anchor_daily" (
	"anchor_id" text NOT NULL,
	"date" text NOT NULL,
	"nickname_snapshot" text,
	"total_fan_ticket" bigint,
	"live_fan_ticket_no_guest" bigint,
	"property_fan_ticket_no_guest" bigint,
	"guest_fan_ticket" bigint,
	"activity_fan_ticket_no_guest" bigint,
	"special_fan_ticket" bigint,
	"subscribe_fan_ticket" bigint,
	"pk_fan_ticket" bigint,
	"link_screen_fan_ticket" bigint,
	"link_screen_room_fan_ticket" bigint,
	"live_duration_1d" numeric(6, 2),
	"valid_live_duration_1d" numeric(6, 2),
	"is_solo_valid_day" integer,
	"feed_watch_duration_1d" numeric(6, 2),
	"feed_acu" integer,
	"peak_per_minute_ucnt" integer,
	"total_fans" integer,
	"new_follow_fans_1d" integer,
	"video_view_count" integer,
	"video_like_count" integer,
	"video_comment_count" integer,
	"current_percent" numeric(5, 4),
	"game_share_percent" numeric(5, 4),
	"pay_money_connect_share_percent" numeric(5, 4),
	"profit_share_ratio" numeric(5, 4),
	"broker_snapshot" text,
	"signing_type_snapshot" text,
	"last_live_time_snapshot" text,
	"is_new" integer,
	"anchor_info" text,
	"star_guard_earn_score" bigint,
	"total_ticket_outside_link" bigint,
	"stat_guard_enter_account_earn_score" bigint,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anchor_daily_anchor_id_date_pk" PRIMARY KEY("anchor_id","date")
);
--> statement-breakpoint
CREATE TABLE "anchor_game_promo_daily" (
	"anchor_id" text NOT NULL,
	"date" text NOT NULL,
	"promote_scene" text NOT NULL,
	"biz_mode" text NOT NULL,
	"game_name" text NOT NULL,
	"promote_live_cnt_1d" integer,
	"promote_live_duration_1d" numeric(6, 2),
	"acu" integer,
	"pcu" integer,
	"promote_anchor_income_1d" bigint,
	"promote_faction_income_1d" bigint,
	"promote_pay_amount_1d" bigint,
	"promote_pay_ucnt_1d" integer,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anchor_game_promo_daily_anchor_id_date_promote_scene_biz_mode_game_name_pk" PRIMARY KEY("anchor_id","date","promote_scene","biz_mode","game_name")
);
--> statement-breakpoint
CREATE TABLE "anchor_minigame_daily" (
	"anchor_id" text NOT NULL,
	"date" text NOT NULL,
	"scene" text NOT NULL,
	"live_room_cnt" integer,
	"live_duration" numeric(6, 2),
	"watch_ucnt" integer,
	"gm_click_ucnt" integer,
	"gm_active_ucnt" integer,
	"gm_pay_ucnt" integer,
	"before_divided_income" bigint,
	"after_divided_author_income" bigint,
	"after_divided_trade_union_income" bigint,
	"cps_bind_uv" integer,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anchor_minigame_daily_anchor_id_date_scene_pk" PRIMARY KEY("anchor_id","date","scene")
);
--> statement-breakpoint
CREATE TABLE "anchor_portrait_daily" (
	"anchor_id" text NOT NULL,
	"date" text NOT NULL,
	"show_uv" integer,
	"enter_uv" integer,
	"enter_ratio" numeric(5, 4),
	"pay_ucnt" integer,
	"pay_ratio" numeric(5, 4),
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anchor_portrait_daily_anchor_id_date_pk" PRIMARY KEY("anchor_id","date")
);
--> statement-breakpoint
CREATE TABLE "anchor_profile" (
	"anchor_id" text PRIMARY KEY NOT NULL,
	"nick_name" text NOT NULL,
	"avatar" text,
	"gender" integer,
	"aweme_display_id" text,
	"aweme_short_id" text,
	"hotsoon_display_id" text,
	"hotsoon_short_id" text,
	"xigua_display_id" text,
	"real_name" text,
	"last_live_time" bigint,
	"live_status" integer,
	"anchor_health_score" integer,
	"anchor_health_score_level" integer,
	"anchor_ban_30d" integer,
	"anchor_violation_30d" integer,
	"notes" text,
	"anchor_sign_type" integer,
	"anchor_sign_out" integer,
	"signing_time" bigint,
	"sign_start_time" bigint,
	"sign_end_time" bigint,
	"union_member_end_date" bigint,
	"auto_renewal" boolean,
	"join_time" bigint,
	"first_live_time_in_faction" bigint,
	"leave_time" bigint,
	"wait_for_leave" boolean,
	"have_operate_relation" boolean,
	"have_recruit_relation" boolean,
	"broker_id" text,
	"broker_name" text,
	"recruit_broker_id" text,
	"recruit_broker_name" text,
	"income_percent" numeric(5, 4),
	"percent_map" jsonb,
	"misc" jsonb,
	"is_threekingdoms" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_minigame_convert" (
	"room_id" text PRIMARY KEY NOT NULL,
	"anchor_id" text NOT NULL,
	"date" text NOT NULL,
	"acu" integer,
	"show_uv" integer,
	"not_open_game_uv" integer,
	"not_open_game_show_uv" integer,
	"not_open_game_click_uv" integer,
	"not_open_game_pay_uv" integer,
	"not_open_show_per" numeric(5, 4),
	"not_open_click_per" numeric(5, 4),
	"not_open_pay_per" numeric(5, 4),
	"open_game_uv" integer,
	"open_game_click_uv" integer,
	"open_game_pay_uv" integer,
	"open_game_click_per" numeric(5, 4),
	"open_game_pay_per" numeric(5, 4),
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_user_mapping" (
	"broker_id" text PRIMARY KEY NOT NULL,
	"broker_name" text NOT NULL,
	"dingtalk_user_id" text,
	"match_source" text DEFAULT 'pending' NOT NULL,
	"matched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_broker_mapping_user" UNIQUE("dingtalk_user_id")
);
--> statement-breakpoint
CREATE TABLE "crawler_cookie_session" (
	"basecamp" text PRIMARY KEY NOT NULL,
	"cookies" jsonb NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"last_check_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_alias" (
	"table_name" text NOT NULL,
	"field_name" text NOT NULL,
	"chinese_name" text NOT NULL,
	"unit" text,
	"hidden" text DEFAULT 'false' NOT NULL,
	"sort_order" text DEFAULT '0' NOT NULL,
	"description" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_alias_table_name_field_name_pk" PRIMARY KEY("table_name","field_name")
);
--> statement-breakpoint
CREATE INDEX "idx_anchor_daily_date" ON "anchor_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_anchor_daily_anchor" ON "anchor_daily" USING btree ("anchor_id");--> statement-breakpoint
CREATE INDEX "idx_game_promo_date" ON "anchor_game_promo_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_game_promo_anchor" ON "anchor_game_promo_daily" USING btree ("anchor_id");--> statement-breakpoint
CREATE INDEX "idx_minigame_date" ON "anchor_minigame_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_minigame_anchor" ON "anchor_minigame_daily" USING btree ("anchor_id");--> statement-breakpoint
CREATE INDEX "idx_portrait_date" ON "anchor_portrait_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_anchor_profile_broker" ON "anchor_profile" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "idx_anchor_profile_recruit_broker" ON "anchor_profile" USING btree ("recruit_broker_id");--> statement-breakpoint
CREATE INDEX "idx_anchor_profile_is_three" ON "anchor_profile" USING btree ("is_threekingdoms");--> statement-breakpoint
CREATE INDEX "idx_anchor_profile_health" ON "anchor_profile" USING btree ("anchor_health_score");--> statement-breakpoint
CREATE INDEX "idx_session_mg_anchor_date" ON "session_minigame_convert" USING btree ("anchor_id","date");--> statement-breakpoint
CREATE INDEX "idx_session_mg_date" ON "session_minigame_convert" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_broker_mapping_user" ON "broker_user_mapping" USING btree ("dingtalk_user_id");--> statement-breakpoint
CREATE INDEX "idx_field_alias_table" ON "field_alias" USING btree ("table_name");