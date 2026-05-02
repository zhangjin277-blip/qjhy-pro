-- C 档：补足短视频流水分成 12 字段。
-- 平台直播+短视频共用一套 fields 命名（cid 区分 task），互动/转化字段
-- 直接复用 promote_live_* / promote_*_ucnt_1d 等现有列；新加视频专属：
--   - 人均游戏视频播放数 → promote_item_uavg_1d
--   - 完播人数           → promote_finish_play_ucnt_1d
--   - 完播率             → promote_finish_play_ratio_1d
-- queries 后续按 promote_scene 拆 live/video 聚合。

ALTER TABLE "anchor_game_promo_daily"
  ADD COLUMN IF NOT EXISTS "promote_item_uavg_1d" numeric(8, 2);
ALTER TABLE "anchor_game_promo_daily"
  ADD COLUMN IF NOT EXISTS "promote_finish_play_ucnt_1d" integer;
ALTER TABLE "anchor_game_promo_daily"
  ADD COLUMN IF NOT EXISTS "promote_finish_play_ratio_1d" numeric(8, 6);
