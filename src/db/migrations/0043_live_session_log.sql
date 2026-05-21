-- 主播打卡：开播/下播记录
CREATE TABLE "live_session_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "live_account_id" text NOT NULL REFERENCES "live_account"("id") ON DELETE CASCADE,
  "anchor_dingtalk_user_id" text NOT NULL REFERENCES "dingtalk_user"("user_id"),
  "start_at" timestamptz NOT NULL DEFAULT NOW(),
  "end_at" timestamptz,
  "duration_seconds" bigint,
  "status" text NOT NULL DEFAULT 'in_progress',
  "closed_by" text,
  "next_anchor_dingtalk_user_id" text,
  "raw" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_live_session_log_account" ON "live_session_log" ("live_account_id");
CREATE INDEX "idx_live_session_log_anchor" ON "live_session_log" ("anchor_dingtalk_user_id");
CREATE INDEX "idx_live_session_log_start" ON "live_session_log" ("start_at");
CREATE INDEX "idx_live_session_log_status" ON "live_session_log" ("status");

-- 一个账号同一时刻只能有一个 in_progress session
CREATE UNIQUE INDEX "uq_live_session_log_account_in_progress"
  ON "live_session_log" ("live_account_id")
  WHERE status = 'in_progress';
