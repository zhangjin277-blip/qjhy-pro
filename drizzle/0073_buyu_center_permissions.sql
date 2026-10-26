-- 捕鱼中心菜单拆分为独立权限模块。
-- 沿用上线前 live_account 的访问范围，确保迁移不会让现有用户突然失去入口；
-- 迁移后 project_buyu / placement / checkin_history 可在权限后台分别配置。
INSERT INTO "role_default_permission"
  ("position", "module", "scope", "points", "description", "updated_at")
SELECT
  source."position",
  target."module",
  source."scope",
  '[]'::jsonb,
  target."description",
  now()
FROM "role_default_permission" source
CROSS JOIN (
  VALUES
    ('project_buyu', '捕鱼中心 / 捕鱼直播项目汇总与账号运营数据'),
    ('checkin_history', '捕鱼中心 / 主播开播与下播记录')
) AS target("module", "description")
WHERE source."module" = 'live_account'
ON CONFLICT ("position", "module") DO NOTHING;

INSERT INTO "auth_permission_override"
  ("user_id", "module", "scope", "points", "reason", "expires_at",
   "delegated_user_ids", "created_by", "created_at")
SELECT
  source."user_id",
  target."module",
  source."scope",
  '[]'::jsonb,
  source."reason",
  source."expires_at",
  source."delegated_user_ids",
  source."created_by",
  source."created_at"
FROM "auth_permission_override" source
CROSS JOIN (VALUES ('project_buyu'), ('checkin_history')) AS target("module")
WHERE source."module" = 'live_account'
ON CONFLICT ("user_id", "module") DO NOTHING;
