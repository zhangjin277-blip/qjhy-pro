-- 为 anchor_profile 加 dingtalk_user_id 列，支持跨平台真人绑定
-- Phase 2.1 加列，不做 UI；后续按需绑
-- 注意：PRO3 历史数据可能不规范，nullable 即可

ALTER TABLE "anchor_profile"
ADD COLUMN "dingtalk_user_id" TEXT;

CREATE INDEX "idx_anchor_profile_dingtalk" ON "anchor_profile"("dingtalk_user_id");
