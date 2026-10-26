ALTER TABLE "placement_import_batch"
  ADD COLUMN IF NOT EXISTS "granularity" text NOT NULL DEFAULT 'hourly';

ALTER TABLE "placement_import_batch"
  DROP CONSTRAINT IF EXISTS "placement_import_batch_granularity_check";

ALTER TABLE "placement_import_batch"
  ADD CONSTRAINT "placement_import_batch_granularity_check"
  CHECK ("granularity" IN ('hourly', 'daily'));

-- 不回填或删除历史数据：旧小时数据原样保留，后续日报批次显式标记为 daily。

CREATE INDEX IF NOT EXISTS "placement_import_batch_granularity_uploaded_at_idx"
  ON "placement_import_batch" ("granularity", "uploaded_at" DESC);
