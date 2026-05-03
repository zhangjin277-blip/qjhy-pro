-- 已离场（已离职 / 试播未签 / 早期主播）标记。
-- 用于从老中台迁移历史数据时，给老库出现过但新库爬虫已不返回的 anchor 建 stub 占位。
-- 默认看板查询应过滤 is_archived=false。
ALTER TABLE "anchor_profile" ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "idx_anchor_profile_archived" ON "anchor_profile" ("is_archived");
