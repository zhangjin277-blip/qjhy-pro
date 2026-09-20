-- AI 漫剧项目独立权限模块：沿用造化仙府的岗位默认访问范围，但保持模块可单独授权。
INSERT INTO "role_default_permission" (position, module, scope, points, description, updated_at)
SELECT
  position,
  'project_ai_comic',
  scope,
  points,
  '项目中心 / AI漫剧多平台内容数据',
  now()
FROM "role_default_permission"
WHERE module = 'project_zhaohua'
ON CONFLICT (position, module) DO NOTHING;
