-- 0046_broker_mapping_drop_unique.sql
-- broker_user_mapping 原约束 uq_broker_mapping_user 强制 dingtalk_user 唯一（1:1），
-- 阻止"多个 broker_name 映射到同一钉钉员工"的合理场景（如外部代号"李子玥"实际是陈家乐）。
-- 改为允许 N:1。

ALTER TABLE "broker_user_mapping"
  DROP CONSTRAINT IF EXISTS "uq_broker_mapping_user";

-- 加普通索引保留 dingtalk_user_id 反查性能
CREATE INDEX IF NOT EXISTS "idx_broker_mapping_user"
  ON "broker_user_mapping" ("dingtalk_user_id");
