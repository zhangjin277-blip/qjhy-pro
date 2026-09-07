CREATE TABLE IF NOT EXISTS "business_recruitment_candidate" (
  "id" text PRIMARY KEY,
  "platform" text NOT NULL,
  "game_product" text NOT NULL,
  "anchor_name" text NOT NULL,
  "gender" text NOT NULL DEFAULT 'unspecified',
  "phone" text NOT NULL,
  "account_nickname" text NOT NULL,
  "account_id" text NOT NULL,
  "uid" text,
  "follower_count" integer NOT NULL DEFAULT 0,
  "account_summary" text,
  "policy" text,
  "recruiter_user_id" text NOT NULL,
  "equipment_status" text,
  "willingness" text,
  "appearance_pass" boolean NOT NULL DEFAULT false,
  "voice_pass" boolean NOT NULL DEFAULT false,
  "expression_pass" boolean NOT NULL DEFAULT false,
  "internet_sense_pass" boolean NOT NULL DEFAULT false,
  "resilience_pass" boolean NOT NULL DEFAULT false,
  "business_review_count" integer NOT NULL DEFAULT 0,
  "operation_review_count" integer,
  "suggested_grade" text,
  "final_grade" text,
  "operator_user_id" text REFERENCES "dingtalk_user"("user_id"),
  "operation_feedback" text,
  "join_date" date,
  "first_live_date" date,
  "signing_status" text NOT NULL DEFAULT 'pending',
  "status" text NOT NULL DEFAULT 'draft',
  "created_by_user_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_business_recruitment_platform_account" UNIQUE ("platform", "account_id"),
  CONSTRAINT "business_recruitment_platform_check" CHECK ("platform" IN ('douyin', 'kuaishou', 'other')),
  CONSTRAINT "business_recruitment_gender_check" CHECK ("gender" IN ('female', 'male', 'unspecified')),
  CONSTRAINT "business_recruitment_equipment_check" CHECK ("equipment_status" IS NULL OR "equipment_status" IN ('ready', 'partial', 'missing')),
  CONSTRAINT "business_recruitment_willingness_check" CHECK ("willingness" IS NULL OR "willingness" IN ('strong', 'medium', 'weak')),
  CONSTRAINT "business_recruitment_grade_check" CHECK (
    ("suggested_grade" IS NULL OR "suggested_grade" IN ('A', 'B', 'C')) AND
    ("final_grade" IS NULL OR "final_grade" IN ('A', 'B', 'C'))
  ),
  CONSTRAINT "business_recruitment_review_count_check" CHECK (
    "business_review_count" BETWEEN 0 AND 5 AND
    ("operation_review_count" IS NULL OR "operation_review_count" BETWEEN 0 AND 5)
  ),
  CONSTRAINT "business_recruitment_signing_check" CHECK ("signing_status" IN ('pending', 'signed', 'declined')),
  CONSTRAINT "business_recruitment_status_check" CHECK ("status" IN ('draft', 'business_review', 'operation_review', 'signing', 'signed', 'live', 'rejected'))
);
CREATE INDEX IF NOT EXISTS "idx_business_recruitment_status_updated" ON "business_recruitment_candidate" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "idx_business_recruitment_recruiter" ON "business_recruitment_candidate" ("recruiter_user_id");
CREATE INDEX IF NOT EXISTS "idx_business_recruitment_operator" ON "business_recruitment_candidate" ("operator_user_id");

CREATE TABLE IF NOT EXISTS "business_recruitment_event" (
  "id" serial PRIMARY KEY,
  "candidate_id" text NOT NULL REFERENCES "business_recruitment_candidate"("id") ON DELETE CASCADE,
  "actor_user_id" text,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_business_recruitment_event_candidate_time" ON "business_recruitment_event" ("candidate_id", "created_at");

INSERT INTO "role_default_permission" ("position", "module", "scope", "points", "description", "updated_at")
VALUES
  ('总监', 'business_recruitment', 'all', '["candidate_edit","operation_review","signing_manage"]'::jsonb, '商务招募全流程管理', now()),
  ('老板', 'business_recruitment', 'all', '["candidate_edit","operation_review","signing_manage"]'::jsonb, '商务招募全流程管理', now()),
  ('商务', 'business_recruitment', 'self', '["candidate_edit"]'::jsonb, '登记并维护本人招募的候选人', now()),
  ('线上商务', 'business_recruitment', 'self', '["candidate_edit"]'::jsonb, '登记并维护本人招募的候选人', now()),
  ('运营', 'business_recruitment', 'self', '["operation_review","signing_manage"]'::jsonb, '复评并跟进分配给本人的候选人', now()),
  ('主播', 'business_recruitment', 'none', '[]'::jsonb, '默认无权限', now()),
  ('剪辑', 'business_recruitment', 'none', '[]'::jsonb, '默认无权限', now()),
  ('行政', 'business_recruitment', 'none', '[]'::jsonb, '默认无权限', now()),
  ('财务', 'business_recruitment', 'none', '[]'::jsonb, '默认无权限', now()),
  ('其他', 'business_recruitment', 'none', '[]'::jsonb, '默认无权限', now())
ON CONFLICT ("position", "module") DO NOTHING;
