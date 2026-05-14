-- 抖音主播视频作品「每日快照」表。
-- 数据源：union.bytedance.com /ark/api/uanchor/.../video/video_list/cagvd5rc77u5ih4edc6g
-- 频率：每天 12:00 全量拉一次（仅"线下运营"组带的主播）
-- 窗口：滑动近 30 天（按 publishTime 筛）
-- 用途：主播明细页"有效视频数"自定义列；查询时取每个 item_id 最新 snapshot_date 的 is_secret=0 计数。
CREATE TABLE IF NOT EXISTS douyin_video_snapshot (
  item_id text NOT NULL,
  snapshot_date date NOT NULL,

  anchor_id text NOT NULL,
  publish_time timestamp with time zone NOT NULL,
  is_secret smallint NOT NULL,

  title text,
  cover_url text,
  play_count integer,
  recommend_play_count integer,
  like_count integer,
  comment_count integer,
  share_count integer,
  new_follow_count integer,
  norm text,

  raw jsonb NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_dy_video_anchor_publish
  ON douyin_video_snapshot (anchor_id, publish_time);

CREATE INDEX IF NOT EXISTS idx_dy_video_snapshot_date
  ON douyin_video_snapshot (snapshot_date);
