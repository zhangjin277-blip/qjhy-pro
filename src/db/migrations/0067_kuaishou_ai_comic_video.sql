CREATE TABLE IF NOT EXISTS "kuaishou_ai_comic_video_snapshot" (
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
  "subscribe_count" integer,
  "raw" jsonb NOT NULL,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "kuaishou_ai_comic_video_snapshot_item_id_snapshot_date_pk"
    PRIMARY KEY ("item_id", "snapshot_date")
);
CREATE INDEX IF NOT EXISTS "idx_kuaishou_ai_comic_publish"
  ON "kuaishou_ai_comic_video_snapshot" ("publish_time");
