-- 直播录制权限种子：全员 scope=all（可看可下载），仅总监/老板可控制任务/删录像。
-- 岗位清单从现有 role_default_permission 行派生，新岗位以后走 UI 配置。
-- 应用方式：docker exec -i qjhy-postgres psql -U qjhy -d qjhy < src/db/migrations/0056_recording_permission_seed.sql
INSERT INTO "role_default_permission"
  (position, module, scope, can_edit, can_export, can_admin, description, updated_at)
SELECT p.position,
       'recording',
       'all',
       p.position IN ('总监', '老板'),
       false,
       p.position IN ('总监', '老板'),
       '直播录制：全员可看可下载，管理员可控制/删文件',
       now()
  FROM (SELECT DISTINCT position FROM "role_default_permission") p
    ON CONFLICT (position, module) DO NOTHING;
