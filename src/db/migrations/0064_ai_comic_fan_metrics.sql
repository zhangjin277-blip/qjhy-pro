ALTER TABLE "zhaohua_official_video_snapshot"
  ADD COLUMN IF NOT EXISTS "unsubscribe_count" integer;

UPDATE "zhaohua_official_video_snapshot"
SET "unsubscribe_count" = NULLIF("raw"->'metrics'->>'unsubscribe_count', '')::integer
WHERE "unsubscribe_count" IS NULL
  AND "raw"->'metrics'->>'unsubscribe_count' ~ '^[0-9]+$';
