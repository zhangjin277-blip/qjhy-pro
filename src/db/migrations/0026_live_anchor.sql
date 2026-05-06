-- 主播业务扩展表
-- 钉钉用户中，仅"主播角色"的子集在此有行（约 50 人）
-- 表的存在本身就是"是否主播"的标记

CREATE TABLE IF NOT EXISTS "live_anchor" (
  "dingtalk_user_id"  TEXT NOT NULL PRIMARY KEY REFERENCES "dingtalk_user"("user_id"),
  "business_line"     TEXT NOT NULL,
  "employment_type"   TEXT NOT NULL,
  "work_status"       TEXT NOT NULL DEFAULT 'active',
  "trial_start_date"  DATE,
  "contract_date"     DATE,
  "leave_date"        DATE,
  "external_name"     TEXT,
  "raw"               JSONB NOT NULL DEFAULT '{}',
  "created_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_live_anchor_business" ON "live_anchor"("business_line");
CREATE INDEX "idx_live_anchor_status" ON "live_anchor"("work_status");
