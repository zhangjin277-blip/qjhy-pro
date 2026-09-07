-- 区分生态主播与竞价主播。存量主播默认归类为生态主播。
ALTER TABLE "live_anchor"
  ADD COLUMN IF NOT EXISTS "anchor_type" text NOT NULL DEFAULT '生态主播';

UPDATE "live_anchor"
SET "anchor_type" = '生态主播'
WHERE "anchor_type" IS NULL OR "anchor_type" = '';

ALTER TABLE "live_anchor"
  DROP CONSTRAINT IF EXISTS "live_anchor_anchor_type_check";

ALTER TABLE "live_anchor"
  ADD CONSTRAINT "live_anchor_anchor_type_check"
  CHECK ("anchor_type" IN ('生态主播', '竞价主播'));
