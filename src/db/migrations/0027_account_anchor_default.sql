-- 账号 ↔ 主播 N:M 默认排班关联表
-- 1 行 = "某主播在某账号上的默认排班规则"
-- 个播：1 行（1 主播 1 账号）
-- 轮播：N 行（N 主播 1 账号，时段不同）
-- effective_from/to: 不直接 UPDATE 旧排班，新建一行 + 旧的设 effective_to

CREATE TABLE IF NOT EXISTS "account_anchor_default" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "account_id"        TEXT NOT NULL REFERENCES "live_account"("id") ON DELETE CASCADE,
  "dingtalk_user_id"  TEXT NOT NULL REFERENCES "live_anchor"("dingtalk_user_id"),
  "time_slots"        JSONB NOT NULL,
  "rest_days"         JSONB NOT NULL DEFAULT '[]',
  "remark"            TEXT,
  "effective_from"    DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_to"      DATE,
  "created_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "uq_account_anchor_default_eff" ON "account_anchor_default"("account_id", "dingtalk_user_id", "effective_from");
CREATE INDEX "idx_account_anchor_default_account" ON "account_anchor_default"("account_id");
CREATE INDEX "idx_account_anchor_default_anchor" ON "account_anchor_default"("dingtalk_user_id");
CREATE INDEX "idx_account_anchor_default_effective" ON "account_anchor_default"("effective_from", "effective_to");
