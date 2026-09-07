CREATE TABLE IF NOT EXISTS "operation_monthly_target" (
  "user_id" text NOT NULL REFERENCES "dingtalk_user"("user_id") ON DELETE CASCADE,
  "month" text NOT NULL,
  "fan_ticket_target" numeric(18,2) NOT NULL,
  "flow_target" numeric(18,2) NOT NULL,
  "active_anchor_target" numeric(10,2) NOT NULL,
  "updated_by_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "operation_monthly_target_user_id_month_pk" PRIMARY KEY ("user_id", "month"),
  CONSTRAINT "operation_monthly_target_month_check" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "operation_monthly_target_nonnegative_check" CHECK (
    "fan_ticket_target" >= 0 AND "flow_target" >= 0 AND "active_anchor_target" >= 0
  )
);
CREATE INDEX IF NOT EXISTS "idx_operation_monthly_target_month"
  ON "operation_monthly_target" ("month");
