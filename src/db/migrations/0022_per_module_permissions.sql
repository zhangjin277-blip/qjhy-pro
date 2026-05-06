-- 权限按板块拆分：每个用户/岗位 × module 一行
-- 支持的 module: dashboard / anchors / crawler / permissions
-- 历史 override / role_default 拆成 4 行（每个 module 沿用旧 scope）

BEGIN;

-- ====== role_default_permission ======

ALTER TABLE "role_default_permission"
  ADD COLUMN IF NOT EXISTS "module" TEXT;

UPDATE "role_default_permission"
   SET "module" = 'dashboard'
 WHERE "module" IS NULL;

ALTER TABLE "role_default_permission"
  ALTER COLUMN "module" SET NOT NULL;

ALTER TABLE "role_default_permission"
  DROP CONSTRAINT IF EXISTS "role_default_permission_pkey";

ALTER TABLE "role_default_permission"
  ADD PRIMARY KEY ("position", "module");

INSERT INTO "role_default_permission"
  (position, module, scope, can_edit, can_export, can_admin, description, updated_at)
SELECT r.position, m.module, r.scope, r.can_edit, r.can_export, r.can_admin, r.description, r.updated_at
  FROM "role_default_permission" r
  CROSS JOIN (VALUES ('anchors'), ('crawler'), ('permissions')) AS m(module)
 WHERE r.module = 'dashboard'
   ON CONFLICT (position, module) DO NOTHING;

CREATE INDEX IF NOT EXISTS "idx_role_default_module"
  ON "role_default_permission" ("module");


-- ====== auth_permission_override ======

ALTER TABLE "auth_permission_override"
  ADD COLUMN IF NOT EXISTS "module" TEXT;

UPDATE "auth_permission_override"
   SET "module" = 'dashboard'
 WHERE "module" IS NULL;

ALTER TABLE "auth_permission_override"
  ALTER COLUMN "module" SET NOT NULL;

ALTER TABLE "auth_permission_override"
  DROP CONSTRAINT IF EXISTS "auth_permission_override_pkey";

ALTER TABLE "auth_permission_override"
  ADD PRIMARY KEY ("user_id", "module");

INSERT INTO "auth_permission_override"
  (user_id, module, scope, can_edit, can_export, can_admin, reason, expires_at, created_by, created_at)
SELECT o.user_id, m.module, o.scope, o.can_edit, o.can_export, o.can_admin, o.reason, o.expires_at, o.created_by, o.created_at
  FROM "auth_permission_override" o
  CROSS JOIN (VALUES ('anchors'), ('crawler'), ('permissions')) AS m(module)
 WHERE o.module = 'dashboard'
   ON CONFLICT (user_id, module) DO NOTHING;

CREATE INDEX IF NOT EXISTS "idx_override_module"
  ON "auth_permission_override" ("module");

COMMIT;
