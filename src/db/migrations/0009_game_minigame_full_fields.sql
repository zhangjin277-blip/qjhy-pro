-- ===========================
-- anchor_game_promo_daily
-- ===========================
-- biz_mode enum 改: cps_all/cpc/poi → cps/cps_all
-- 表是空的，安全 drop+create constraint
ALTER TABLE "anchor_game_promo_daily" DROP CONSTRAINT IF EXISTS "anchor_game_promo_daily_biz_mode_check";

-- 新增字段
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "anchor_name_snapshot" text;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_duration_avg" numeric(8,2);
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_watch_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_watch_duration_1d" numeric(10,2);
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_watch_duration_uavg_1d" numeric(8,2);
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_like_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_comment_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_live_follow_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_video_publish_cnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_item_vv_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_item_uv_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_click_download_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_start_download_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_download_finish_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_install_finish_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_active_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_charge_pay_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "props_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "props_anchor_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "props_faction_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_download_pay_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_download_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_anchor_download_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_faction_download_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_active_pay_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_anchor_active_pay_amount_1d" bigint;
ALTER TABLE "anchor_game_promo_daily" ADD COLUMN IF NOT EXISTS "promote_faction_active_pay_amount_1d" bigint;

-- live_duration_1d 精度扩大
ALTER TABLE "anchor_game_promo_daily" ALTER COLUMN "promote_live_duration_1d" TYPE numeric(8,2);

-- ===========================
-- anchor_minigame_daily
-- ===========================
ALTER TABLE "anchor_minigame_daily" DROP CONSTRAINT IF EXISTS "anchor_minigame_daily_pkey";

ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "mp_name" text NOT NULL DEFAULT '';
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "anchor_name_snapshot" text;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "avg_room_live_duration" numeric(8,2);
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "avg_user_watch_duration" numeric(8,2);
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "watch_duration" numeric(10,2);
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "acu" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "pcu" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "like_ucnt" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "follow_ucnt" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "comment_ucnt" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "play_cnt" bigint;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "play_uv" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "play_cnt_avg" numeric(8,2);
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "finish_play_uv" integer;
ALTER TABLE "anchor_minigame_daily" ADD COLUMN IF NOT EXISTS "finish_play_ratio" numeric(5,4);

ALTER TABLE "anchor_minigame_daily" ALTER COLUMN "live_duration" TYPE numeric(8,2);

-- 重建 PK 含 mp_name
ALTER TABLE "anchor_minigame_daily"
  ADD CONSTRAINT "anchor_minigame_daily_pkey"
  PRIMARY KEY ("anchor_id", "date", "scene", "mp_name");
