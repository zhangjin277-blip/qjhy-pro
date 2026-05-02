-- B 档：补 6 个"率"字段（直播 promo 3 + 小游戏 3）。
-- 爬虫 fields 数组本来就抓了 likeUcntRatio / followUcntRatio / commentUcntRatio
-- 和 promoteLiveLikeUAvg1d / promoteLiveFollowUAvg1d / promoteLiveCommentUAvg1d，
-- 之前 parser 漏解析、schema 漏存。本迁移只 ADD COLUMN，旧行 NULL，下次爬虫回填。

-- ===========================
-- anchor_game_promo_daily：直播率字段
-- ===========================
ALTER TABLE "anchor_game_promo_daily"
  ADD COLUMN IF NOT EXISTS "promote_live_like_uavg_1d" numeric(8, 6);
ALTER TABLE "anchor_game_promo_daily"
  ADD COLUMN IF NOT EXISTS "promote_live_comment_uavg_1d" numeric(8, 6);
ALTER TABLE "anchor_game_promo_daily"
  ADD COLUMN IF NOT EXISTS "promote_live_follow_uavg_1d" numeric(8, 6);

-- ===========================
-- anchor_minigame_daily：小游戏率字段
-- ===========================
ALTER TABLE "anchor_minigame_daily"
  ADD COLUMN IF NOT EXISTS "like_ucnt_ratio" numeric(8, 6);
ALTER TABLE "anchor_minigame_daily"
  ADD COLUMN IF NOT EXISTS "follow_ucnt_ratio" numeric(8, 6);
ALTER TABLE "anchor_minigame_daily"
  ADD COLUMN IF NOT EXISTS "comment_ucnt_ratio" numeric(8, 6);
