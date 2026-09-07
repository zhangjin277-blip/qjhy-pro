CREATE TABLE IF NOT EXISTS "project_shared_state" (
  "project_key" text NOT NULL,
  "state_key" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "revision" integer NOT NULL DEFAULT 1,
  "updated_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "project_shared_state_pk" PRIMARY KEY ("project_key", "state_key")
);

CREATE INDEX IF NOT EXISTS "idx_project_shared_state_updated_at"
  ON "project_shared_state" ("updated_at");
