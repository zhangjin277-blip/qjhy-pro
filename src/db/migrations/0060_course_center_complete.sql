ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "categories" jsonb DEFAULT '[]'::jsonb NOT NULL;
UPDATE "course"
SET "categories" = CASE
  WHEN "category" IS NULL OR btrim("category") = '' THEN '[]'::jsonb
  WHEN left(btrim("category"), 1) = '[' THEN "category"::jsonb
  ELSE jsonb_build_array("category")
END
WHERE "categories" = '[]'::jsonb;

ALTER TABLE "course_progress" ADD COLUMN IF NOT EXISTS "last_viewed_at" timestamptz DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "course_like" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "public"."dingtalk_user"("user_id"),
  "course_id" text NOT NULL REFERENCES "public"."course"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_course_like" UNIQUE("user_id", "course_id")
);

CREATE TABLE IF NOT EXISTS "anchor_training" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "anchor_id" text NOT NULL REFERENCES "public"."anchor_profile"("anchor_id") ON DELETE cascade,
  "course_id" text NOT NULL REFERENCES "public"."course"("id") ON DELETE cascade,
  "assigned_by_user_id" text REFERENCES "public"."dingtalk_user"("user_id"),
  "is_required" boolean DEFAULT true NOT NULL,
  "deadline" date,
  "status" text DEFAULT 'not_started' NOT NULL,
  "score" integer,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_anchor_training" UNIQUE("anchor_id", "course_id")
);
CREATE INDEX IF NOT EXISTS "idx_anchor_training_anchor" ON "anchor_training" ("anchor_id");
ALTER TABLE "anchor_training" ADD COLUMN IF NOT EXISTS "remark" text;
ALTER TABLE "anchor_training" ADD COLUMN IF NOT EXISTS "started_at" timestamptz;

CREATE TABLE IF NOT EXISTS "training_template" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "project" text,
  "course_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "description" text,
  "created_by_user_id" text REFERENCES "public"."dingtalk_user"("user_id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_training_template_project" ON "training_template" ("project");

UPDATE "role_default_permission"
SET points = CASE
  WHEN points ? 'course_edit' THEN points || '["training_manage"]'::jsonb
  ELSE points
END,
updated_at = now()
WHERE module = 'courses' AND NOT (points ? 'training_manage');
