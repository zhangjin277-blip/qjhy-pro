-- 用户自定义列预设表（内置预设仍在前端代码，本表只存用户保存的）
CREATE TABLE IF NOT EXISTS "user_column_preset" (
  "id" SERIAL PRIMARY KEY,
  "dingtalk_user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "columns" JSONB NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "uq_user_column_preset_user_name" UNIQUE ("dingtalk_user_id", "name")
);
CREATE INDEX IF NOT EXISTS "idx_user_column_preset_user" ON "user_column_preset" ("dingtalk_user_id");
