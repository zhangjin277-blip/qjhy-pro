CREATE TABLE IF NOT EXISTS "people_performance_profile" (
  "user_id" text PRIMARY KEY REFERENCES "dingtalk_user"("user_id") ON DELETE CASCADE,
  "manager_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "hire_date" date NOT NULL,
  "employment_status" text NOT NULL DEFAULT 'probation',
  "probation_months" integer NOT NULL DEFAULT 2 CHECK ("probation_months" IN (2, 6)),
  "regularized_at" date,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_people_performance_profile_manager" ON "people_performance_profile" ("manager_user_id");
CREATE INDEX IF NOT EXISTS "idx_people_performance_profile_status" ON "people_performance_profile" ("employment_status");

CREATE TABLE IF NOT EXISTS "performance_cycle" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "dingtalk_user"("user_id") ON DELETE CASCADE,
  "parent_cycle_id" text,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "sequence" integer NOT NULL DEFAULT 1,
  "stage" text NOT NULL DEFAULT 'scheduled',
  "manager_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "hr_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "self_summary" text,
  "manager_summary" text,
  "hr_comment" text,
  "final_score" numeric(5,2),
  "final_grade" text,
  "probation_result" text,
  "confirmed_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_performance_cycle_user_kind_period" UNIQUE ("user_id", "kind", "period_start")
);
CREATE INDEX IF NOT EXISTS "idx_performance_cycle_user_time" ON "performance_cycle" ("user_id", "period_start");
CREATE INDEX IF NOT EXISTS "idx_performance_cycle_stage" ON "performance_cycle" ("stage", "period_start");
CREATE INDEX IF NOT EXISTS "idx_performance_cycle_parent" ON "performance_cycle" ("parent_cycle_id");

CREATE TABLE IF NOT EXISTS "performance_goal" (
  "id" text PRIMARY KEY,
  "cycle_id" text NOT NULL REFERENCES "performance_cycle"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "metric" text NOT NULL DEFAULT '',
  "target_value" text NOT NULL DEFAULT '',
  "weight" numeric(5,2) NOT NULL,
  "completion" text,
  "self_score" numeric(5,2),
  "manager_score" numeric(5,2),
  "manager_comment" text,
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_performance_goal_cycle_order" ON "performance_goal" ("cycle_id", "sort_order");

CREATE TABLE IF NOT EXISTS "performance_event" (
  "id" serial PRIMARY KEY,
  "cycle_id" text NOT NULL REFERENCES "performance_cycle"("id") ON DELETE CASCADE,
  "actor_user_id" text,
  "event_type" text NOT NULL,
  "from_stage" text,
  "to_stage" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_performance_event_cycle_time" ON "performance_event" ("cycle_id", "created_at");

CREATE TABLE IF NOT EXISTS "performance_notification" (
  "id" serial PRIMARY KEY,
  "cycle_id" text NOT NULL REFERENCES "performance_cycle"("id") ON DELETE CASCADE,
  "recipient_user_id" text NOT NULL REFERENCES "dingtalk_user"("user_id") ON DELETE CASCADE,
  "dedupe_key" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_performance_notification_dedupe" UNIQUE ("cycle_id", "recipient_user_id", "dedupe_key")
);

INSERT INTO "role_default_permission" ("position", "module", "scope", "points", "description", "updated_at")
VALUES
  ('总监', 'people_performance', 'all', '["manage_profiles","manage_process","calibrate"]'::jsonb, '人员绩效全流程管理', now()),
  ('老板', 'people_performance', 'all', '["manage_profiles","manage_process","calibrate"]'::jsonb, '人员绩效全流程管理', now()),
  ('行政', 'people_performance', 'all', '["manage_profiles","manage_process","calibrate"]'::jsonb, '人员绩效全流程管理', now()),
  ('运营', 'people_performance', 'self', '[]'::jsonb, '查看并处理本人绩效', now()),
  ('主播', 'people_performance', 'self', '[]'::jsonb, '查看并处理本人绩效', now()),
  ('剪辑', 'people_performance', 'self', '[]'::jsonb, '查看并处理本人绩效', now()),
  ('财务', 'people_performance', 'self', '[]'::jsonb, '查看并处理本人绩效', now()),
  ('其他', 'people_performance', 'self', '[]'::jsonb, '查看并处理本人绩效', now())
ON CONFLICT ("position", "module") DO NOTHING;
