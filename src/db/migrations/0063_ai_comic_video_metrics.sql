ALTER TABLE "zhaohua_official_video_snapshot"
  ADD COLUMN IF NOT EXISTS "danmaku_count" integer;

UPDATE "zhaohua_official_video_snapshot"
SET "danmaku_count" = NULLIF("raw"->'metrics'->>'danmaku_count', '')::integer
WHERE "danmaku_count" IS NULL
  AND "raw"->'metrics'->>'danmaku_count' ~ '^[0-9]+$';
