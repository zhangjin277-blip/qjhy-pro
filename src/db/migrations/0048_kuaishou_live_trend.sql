-- 用 666 trend 接口替代之前的 baseinfo snapshot 方案
-- 旧表只有 ~1 小时数据，没业务依赖，直接 drop 重建

DROP TABLE IF EXISTS kuaishou_live_amt_snapshot;

-- 快手 666 机构后台 trend 接口的累计分时点（每 stream 每分钟一个点）。
-- 主键 (live_stream_id_str, ts) 让多次拉取自动去重 / 修复。
--
-- 字段说明：
--   live_stream_id_str: 字符串 ID（"n4qImNF2Bf0"），666 接口用此 ID 查询
--   member_id        : 主播数字 ID 字符串（与 live_account.platform_account_id 对齐）
--   ts               : trend 点时间戳（来自接口 trendData[i].time 毫秒）
--   valid_income_cents: SUM_VALID_INCOME × 100，累计值，单位分
--   online_count     : 当下在线人数（非累计）
--   bullet_count / like_count / share_count: 累计互动数
--
-- 计算主播班次流水（按 live_session_log 时间窗）：
--   SELECT SUM(per_stream_diff) FROM (
--     SELECT MAX(valid_income_cents) - MIN(valid_income_cents) AS per_stream_diff
--     FROM kuaishou_live_trend
--     WHERE member_id = ? AND ts BETWEEN <session.start_at> AND COALESCE(<session.end_at>, now())
--     GROUP BY live_stream_id_str
--   ) t;
CREATE TABLE IF NOT EXISTS kuaishou_live_trend (
  live_stream_id_str  TEXT         NOT NULL,
  member_id           TEXT         NOT NULL,
  member_name         TEXT,
  ts                  TIMESTAMPTZ  NOT NULL,
  valid_income_cents  BIGINT       NOT NULL DEFAULT 0,
  online_count        INT,
  bullet_count        BIGINT,
  like_count          BIGINT,
  share_count         BIGINT,
  fetched_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (live_stream_id_str, ts)
);

CREATE INDEX IF NOT EXISTS idx_ks_trend_member_ts
  ON kuaishou_live_trend (member_id, ts);

CREATE INDEX IF NOT EXISTS idx_ks_trend_ts
  ON kuaishou_live_trend (ts);
