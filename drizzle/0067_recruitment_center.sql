CREATE TABLE IF NOT EXISTS "recruitment_candidate" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "phone" text,
  "gender" text NOT NULL DEFAULT 'unspecified',
  "identity_key" text,
  "linked_dingtalk_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recruitment_candidate_gender_check" CHECK ("gender" IN ('female', 'male', 'unspecified')),
  CONSTRAINT "uq_recruitment_candidate_identity" UNIQUE ("identity_key")
);
CREATE INDEX IF NOT EXISTS "idx_recruitment_candidate_name" ON "recruitment_candidate" ("name");
CREATE INDEX IF NOT EXISTS "idx_recruitment_candidate_dingtalk" ON "recruitment_candidate" ("linked_dingtalk_user_id");

CREATE TABLE IF NOT EXISTS "recruitment_application" (
  "id" text PRIMARY KEY,
  "candidate_id" text NOT NULL REFERENCES "recruitment_candidate"("id") ON DELETE CASCADE,
  "project" text,
  "channel" text NOT NULL DEFAULT 'other',
  "source_account" text,
  "recruiter_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "recruiter_name_snapshot" text,
  "stage" text NOT NULL DEFAULT 'invited',
  "invited_date" date NOT NULL,
  "interview_date" date,
  "interview_time" time,
  "attendance_status" text NOT NULL DEFAULT 'pending',
  "initial_result" text NOT NULL DEFAULT 'pending',
  "final_result" text NOT NULL DEFAULT 'pending',
  "offer_status" text NOT NULL DEFAULT 'pending',
  "expected_join_date" date,
  "actual_join_date" date,
  "trial_result" text NOT NULL DEFAULT 'pending',
  "trial_date" date,
  "mentor_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "mentor_name_snapshot" text,
  "contract_status" text NOT NULL DEFAULT 'pending',
  "leave_date" date,
  "leave_reason" text,
  "notes" text,
  "source_key" text,
  "legacy_business_candidate_id" text,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recruitment_application_stage_check" CHECK ("stage" IN ('invited','interview','initial_pass','final_pass','offer','joined','trial_pass','rejected','withdrawn','left')),
  CONSTRAINT "recruitment_application_attendance_check" CHECK ("attendance_status" IN ('pending','attended','no_show')),
  CONSTRAINT "recruitment_application_initial_check" CHECK ("initial_result" IN ('pending','pass','fail')),
  CONSTRAINT "recruitment_application_final_check" CHECK ("final_result" IN ('pending','pass','fail')),
  CONSTRAINT "recruitment_application_offer_check" CHECK ("offer_status" IN ('pending','sent','declined')),
  CONSTRAINT "recruitment_application_trial_check" CHECK ("trial_result" IN ('pending','pass','fail')),
  CONSTRAINT "recruitment_application_contract_check" CHECK ("contract_status" IN ('pending','signed','declined')),
  CONSTRAINT "uq_recruitment_application_source" UNIQUE ("source_key")
);
CREATE INDEX IF NOT EXISTS "idx_recruitment_application_stage_date" ON "recruitment_application" ("stage", "invited_date");
CREATE INDEX IF NOT EXISTS "idx_recruitment_application_recruiter" ON "recruitment_application" ("recruiter_user_id");
CREATE INDEX IF NOT EXISTS "idx_recruitment_application_project" ON "recruitment_application" ("project");
CREATE INDEX IF NOT EXISTS "idx_recruitment_application_candidate" ON "recruitment_application" ("candidate_id");

CREATE TABLE IF NOT EXISTS "recruitment_stage_event" (
  "id" serial PRIMARY KEY,
  "application_id" text NOT NULL REFERENCES "recruitment_application"("id") ON DELETE CASCADE,
  "actor_user_id" text,
  "event_type" text NOT NULL,
  "from_stage" text,
  "to_stage" text,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "idx_recruitment_stage_event_application_time" ON "recruitment_stage_event" ("application_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "recruitment_demand" (
  "id" text PRIMARY KEY,
  "month" date NOT NULL,
  "category" text,
  "project" text NOT NULL,
  "target_count" integer NOT NULL,
  "notes" text,
  "created_by_user_id" text NOT NULL,
  "updated_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recruitment_demand_target_check" CHECK ("target_count" >= 0),
  CONSTRAINT "uq_recruitment_demand_month_project" UNIQUE ("month", "project")
);
CREATE INDEX IF NOT EXISTS "idx_recruitment_demand_month" ON "recruitment_demand" ("month");

UPDATE "role_default_permission"
SET "points" = CASE
  WHEN NOT ("points" ? 'demand_manage') THEN "points" || '["demand_manage"]'::jsonb
  ELSE "points"
END,
"updated_at" = now()
WHERE "module" = 'business_recruitment' AND "position" IN ('总监', '老板');
