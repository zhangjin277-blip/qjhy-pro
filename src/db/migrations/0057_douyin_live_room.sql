-- 抖音公会后台「正在直播」快照（union get_room_by_label，5min job upsert）。
-- 一行 = 一场直播（room_id 唯一）：首次看到写 start_at，后续刷新流水/人气/last_seen_at。
-- 「当前在播」口径 = last_seen_at 在最近 15 分钟内（同 kuaishou_live_trend 的窗口思路）。
-- 场次结束后行保留，自然沉淀抖音场次历史（开播时间 + 最终流水）。
CREATE TABLE IF NOT EXISTS douyin_live_room (
  room_id text PRIMARY KEY,
  platform_uid text NOT NULL,
  nick_name text,
  title text,
  start_at timestamptz NOT NULL,
  ticket_count bigint,
  user_count integer,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_douyin_live_room_uid ON douyin_live_room (platform_uid);
CREATE INDEX IF NOT EXISTS idx_douyin_live_room_last_seen ON douyin_live_room (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_douyin_live_room_start ON douyin_live_room (start_at);
