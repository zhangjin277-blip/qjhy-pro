-- 小红书 AI漫剧使用独立 Cookie 槽位，不与其他平台共享登录态。
CREATE TABLE IF NOT EXISTS "xiaohongshu_ai_comic_video_snapshot" (
  "item_id" text NOT NULL,
  "snapshot_date" date NOT NULL,
  "publish_time" timestamptz NOT NULL,
  "description" text,
  "cover_url" text,
  "view_count" integer,
  "like_count" integer,
  "comment_count" integer,
  "share_count" integer,
  "favorite_count" integer,
  "danmaku_count" integer,
  "subscribe_count" integer,
  "avg_view_second" numeric(12,3),
  "completion_rate" numeric(10,6),
  "completion_rate_5s" numeric(10,6),
  "bounce_rate_2s" numeric(10,6),
  "cover_click_rate" numeric(10,6),
  "raw" jsonb NOT NULL,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "xiaohongshu_ai_comic_video_snapshot_pk"
    PRIMARY KEY ("item_id", "snapshot_date")
);
CREATE INDEX IF NOT EXISTS "idx_xiaohongshu_ai_comic_publish"
  ON "xiaohongshu_ai_comic_video_snapshot" ("publish_time");
