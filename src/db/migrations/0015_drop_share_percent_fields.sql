-- 删除 2 个平台 daily CSV 不提供的分成比列。
-- 原列在 schema 里属历史遗留字段，平台"指标配置"对话框中无对应指标。
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "game_share_percent";
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "pay_money_connect_share_percent";
