-- Phase C: user_column_preset 加 platform 字段，让快手也能保存预设
-- 已存量行默认 platform='douyin'（之前只有抖音）

ALTER TABLE "user_column_preset" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'douyin';

-- 唯一键改成 (user_id, platform, name) 让两 platform 同名不冲突
ALTER TABLE "user_column_preset" DROP CONSTRAINT IF EXISTS "uq_user_column_preset_user_name";
ALTER TABLE "user_column_preset"
  ADD CONSTRAINT "uq_user_column_preset_user_platform_name"
  UNIQUE ("dingtalk_user_id", "platform", "name");

-- 索引改成 (user_id, platform) 加速 GET ?platform= 查询
DROP INDEX IF EXISTS "idx_user_column_preset_user";
CREATE INDEX IF NOT EXISTS "idx_user_column_preset_user_platform"
  ON "user_column_preset" ("dingtalk_user_id", "platform");
