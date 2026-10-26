-- B站 AI漫剧使用独立 Cookie 槽位，不与其他平台共享登录态。
-- crawler_cookie_session.basecamp 是 text，首次保存时直接新增 bilibili_creator 记录。
CREATE TABLE IF NOT EXISTS "bilibili_ai_comic_video_snapshot" (
  "item_id" text NOT NULL,
  "snapshot_date" date NOT NULL,
  "publish_time" timestamptz NOT NULL,
  "description" text,
  "cover_url" text,
  "duration_ms" integer,
  "view_count" integer,
  "like_count" integer,
  "comment_count" integer,
  "share_count" integer,
  "favorite_count" integer,
  "danmaku_count" integer,
  "coin_count" integer,
  "subscribe_count" integer,
  "unsubscribe_count" integer,
  "raw" jsonb NOT NULL,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bilibili_ai_comic_video_snapshot_pk"
    PRIMARY KEY ("item_id", "snapshot_date")
);
CREATE INDEX IF NOT EXISTS "idx_bilibili_ai_comic_publish"
  ON "bilibili_ai_comic_video_snapshot" ("publish_time");
