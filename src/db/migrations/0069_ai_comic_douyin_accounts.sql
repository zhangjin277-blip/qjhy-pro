ALTER TABLE "zhaohua_official_video_snapshot"
  ADD COLUMN IF NOT EXISTS "account_key" text NOT NULL DEFAULT 'sun-xiaosheng';

ALTER TABLE "zhaohua_official_video_daily"
  ADD COLUMN IF NOT EXISTS "account_key" text NOT NULL DEFAULT 'sun-xiaosheng';

ALTER TABLE "zhaohua_official_video_hourly"
  ADD COLUMN IF NOT EXISTS "account_key" text NOT NULL DEFAULT 'sun-xiaosheng';

ALTER TABLE "zhaohua_official_video_snapshot"
  DROP CONSTRAINT IF EXISTS "zhaohua_official_video_snapshot_pkey";
ALTER TABLE "zhaohua_official_video_snapshot"
  ADD CONSTRAINT "zhaohua_official_video_snapshot_pkey"
  PRIMARY KEY ("account_key", "item_id", "snapshot_date");

ALTER TABLE "zhaohua_official_video_daily"
  DROP CONSTRAINT IF EXISTS "zhaohua_official_video_daily_pkey";
ALTER TABLE "zhaohua_official_video_daily"
  ADD CONSTRAINT "zhaohua_official_video_daily_pkey"
  PRIMARY KEY ("account_key", "metric_date");

ALTER TABLE "zhaohua_official_video_hourly"
  DROP CONSTRAINT IF EXISTS "zhaohua_official_video_hourly_item_id_metric_type_point_at_pk";
ALTER TABLE "zhaohua_official_video_hourly"
  ADD CONSTRAINT "zhaohua_official_video_hourly_item_id_metric_type_point_at_pk"
  PRIMARY KEY ("account_key", "item_id", "metric_type", "point_at");

DROP INDEX IF EXISTS "idx_zhaohua_official_video_publish";
CREATE INDEX "idx_zhaohua_official_video_publish"
  ON "zhaohua_official_video_snapshot" ("account_key", "publish_time");

DROP INDEX IF EXISTS "idx_zhaohua_official_video_snapshot_date";
CREATE INDEX "idx_zhaohua_official_video_snapshot_date"
  ON "zhaohua_official_video_snapshot" ("account_key", "snapshot_date");

DROP INDEX IF EXISTS "idx_zhaohua_official_video_hourly_metric";
CREATE INDEX "idx_zhaohua_official_video_hourly_metric"
  ON "zhaohua_official_video_hourly" ("account_key", "item_id", "metric_type", "point_at");
