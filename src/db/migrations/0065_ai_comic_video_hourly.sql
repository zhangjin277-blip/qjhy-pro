CREATE TABLE IF NOT EXISTS "zhaohua_official_video_hourly" (
  "item_id" text NOT NULL,
  "metric_type" integer NOT NULL,
  "point_at" timestamptz NOT NULL,
  "value" numeric(20, 6) NOT NULL,
  "raw" jsonb NOT NULL,
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "zhaohua_official_video_hourly_item_id_metric_type_point_at_pk"
    PRIMARY KEY ("item_id", "metric_type", "point_at")
);

CREATE INDEX IF NOT EXISTS "idx_zhaohua_official_video_hourly_metric"
  ON "zhaohua_official_video_hourly" ("item_id", "metric_type", "point_at");
