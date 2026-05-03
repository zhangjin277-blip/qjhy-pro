-- 删除 5 个 video scene 专属字段（live scene CSV/JSON 都不返）。
-- 切换到 JSON 模式后，这些字段在新 parser 里也不再出现。
ALTER TABLE "anchor_minigame_daily" DROP COLUMN IF EXISTS "play_cnt";
ALTER TABLE "anchor_minigame_daily" DROP COLUMN IF EXISTS "play_uv";
ALTER TABLE "anchor_minigame_daily" DROP COLUMN IF EXISTS "play_cnt_avg";
ALTER TABLE "anchor_minigame_daily" DROP COLUMN IF EXISTS "finish_play_uv";
ALTER TABLE "anchor_minigame_daily" DROP COLUMN IF EXISTS "finish_play_ratio";
