CREATE TABLE IF NOT EXISTS "zhaohua_official_video_snapshot" (
  "item_id" text NOT NULL,
  "snapshot_date" date NOT NULL,
  "publish_time" timestamptz NOT NULL,
  "description" text,
  "cover_url" text,
  "duration_ms" integer,
  "visibility" text,
  "view_count" integer,
  "like_count" integer,
  "comment_count" integer,
  "share_count" integer,
  "favorite_count" integer,
  "danmaku_count" integer,
  "subscribe_count" integer,
  "unsubscribe_count" integer,
  "avg_view_second" numeric(12,3),
  "avg_view_proportion" numeric(10,6),
  "completion_rate" numeric(10,6),
  "completion_rate_5s" numeric(10,6),
  "bounce_rate_2s" numeric(10,6),
  "cover_click_rate" numeric(10,6),
  "raw" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("item_id", "snapshot_date")
);
CREATE INDEX IF NOT EXISTS "idx_zhaohua_official_video_publish" ON "zhaohua_official_video_snapshot" ("publish_time");
CREATE INDEX IF NOT EXISTS "idx_zhaohua_official_video_snapshot_date" ON "zhaohua_official_video_snapshot" ("snapshot_date");
CREATE TABLE IF NOT EXISTS "zhaohua_official_video_daily" (
  "metric_date" date PRIMARY KEY,
  "publish_count" integer,
  "play_count" integer,
  "like_count" integer,
  "share_count" integer,
  "comment_count" integer,
  "net_fans_count" integer,
  "cancel_fans_count" integer,
  "homepage_view_count" integer,
  "completion_rate_5s" numeric(10,6),
  "bounce_rate_2s" numeric(10,6),
  "cover_click_rate" numeric(10,6),
  "raw" jsonb NOT NULL,
  "collected_at" timestamp NOT NULL DEFAULT now()
);
