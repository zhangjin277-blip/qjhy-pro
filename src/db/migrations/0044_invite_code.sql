-- 0044_invite_code.sql
-- 邀请码注册系统：auth_user / dingtalk_user 扩展 + auth_invite_code / auth_invite_code_use 新表

-- 1. auth_user 扩展：外部用户标记 / 账号有效期 / 启用开关
ALTER TABLE "auth_user"
  ADD COLUMN "is_external" boolean NOT NULL DEFAULT false,
  ADD COLUMN "expire_at" timestamp,
  ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;

-- 2. dingtalk_user 扩展：外部用户复用此表（user_id 用 "ext_<uuid>"）
ALTER TABLE "dingtalk_user"
  ADD COLUMN "is_external" boolean NOT NULL DEFAULT false,
  ADD COLUMN "auth_user_id" text;

CREATE INDEX "idx_dingtalk_user_external" ON "dingtalk_user" ("is_external");
CREATE INDEX "idx_dingtalk_user_auth_user" ON "dingtalk_user" ("auth_user_id");

-- 3. 邀请码主表
CREATE TABLE "auth_invite_code" (
  "code" text PRIMARY KEY NOT NULL,
  "perms" jsonb NOT NULL,
  "max_uses" integer NOT NULL DEFAULT 1,
  "used_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp,
  "account_expire_at" timestamp,
  "revoked_at" timestamp,
  "note" text,
  "created_by" text REFERENCES "dingtalk_user"("user_id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "idx_invite_code_revoked" ON "auth_invite_code" ("revoked_at");
CREATE INDEX "idx_invite_code_created_by" ON "auth_invite_code" ("created_by");

-- 4. 邀请码使用审计
CREATE TABLE "auth_invite_code_use" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL REFERENCES "auth_invite_code"("code") ON DELETE CASCADE,
  "auth_user_id" text NOT NULL,
  "dingtalk_user_id" text NOT NULL,
  "used_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "idx_invite_code_use_code" ON "auth_invite_code_use" ("code");
CREATE INDEX "idx_invite_code_use_auth_user" ON "auth_invite_code_use" ("auth_user_id");
