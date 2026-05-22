-- 快手直播间收入分钟级 snapshot（baseinfo 接口拉取）
-- 1 分钟 cron 写一行，按 (live_stream_id, snapshot_at) 主键去重。
-- 计算主播班次流水：
--   SELECT SUM(per_stream) FROM (
--     SELECT MAX(income_cents) - MIN(income_cents) AS per_stream
--     FROM kuaishou_live_amt_snapshot
--     WHERE member_id = ? AND snapshot_at BETWEEN ? AND ?
--     GROUP BY live_stream_id
--   ) t;
CREATE TABLE IF NOT EXISTS kuaishou_live_amt_snapshot (
  live_stream_id    BIGINT       NOT NULL,
  member_id         TEXT         NOT NULL,
  member_name       TEXT,
  income_cents      BIGINT,        -- 主播总收入（分）= baseinfo.income
  org_income_cents  BIGINT,        -- 机构收入（分）= baseinfo.orgIncome
  online_count      INT,
  total_count       INT,
  like_count        TEXT,          -- 可能是 "1.2万" 字符串，原文存
  comment_count     INT,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_stream_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_ks_snap_member_time
  ON kuaishou_live_amt_snapshot (member_id, snapshot_at);

CREATE INDEX IF NOT EXISTS idx_ks_snap_time
  ON kuaishou_live_amt_snapshot (snapshot_at);
