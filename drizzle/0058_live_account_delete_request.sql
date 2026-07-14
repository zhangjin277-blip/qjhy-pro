-- 直播账号删除申请（审核流）。手动应用：本地 + NAS 各跑一次。
-- psql -U qjhy -d qjhy -f 0058_live_account_delete_request.sql
CREATE TABLE IF NOT EXISTS "live_account_delete_request" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "account_name" text NOT NULL,
  "product" text NOT NULL,
  "account_snapshot" jsonb NOT NULL,
  "impact" jsonb NOT NULL,
  "reason" text,
  "status" text NOT NULL DEFAULT 'pending',
  "requested_by_user_id" text NOT NULL REFERENCES "dingtalk_user"("user_id"),
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_by_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "reviewed_at" timestamptz,
  "review_note" text
);
CREATE INDEX IF NOT EXISTS "idx_account_delete_request_status"
  ON "live_account_delete_request" ("status", "requested_at");
CREATE INDEX IF NOT EXISTS "idx_account_delete_request_account"
  ON "live_account_delete_request" ("account_id");
-- 每账号同时只允许一条待审申请
CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_delete_request_pending"
  ON "live_account_delete_request" ("account_id") WHERE "status" = 'pending';
