CREATE TABLE IF NOT EXISTS "wechat_ai_comic_video_snapshot" (
  "item_id" text NOT NULL,
  "snapshot_date" date NOT NULL,
  "publish_time" timestamptz NOT NULL,
  "description" text,
  "cover_url" text,
  "view_count" integer,
  "like_count" integer,
  "comment_count" integer,
  "share_count" integer,
  "subscribe_count" integer,
  "raw" jsonb NOT NULL,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "wechat_ai_comic_video_snapshot_pk" PRIMARY KEY ("item_id", "snapshot_date")
);
CREATE INDEX IF NOT EXISTS "idx_wechat_ai_comic_publish" ON "wechat_ai_comic_video_snapshot" ("publish_time");
CREATE TABLE IF NOT EXISTS "wechat_ai_comic_daily" (
  "metric_date" date PRIMARY KEY,
  "publish_count" integer,
  "play_count" integer,
  "like_count" integer,
  "comment_count" integer,
  "share_count" integer,
  "net_fans_count" integer,
  "raw" jsonb NOT NULL,
  "collected_at" timestamptz NOT NULL DEFAULT now()
);
