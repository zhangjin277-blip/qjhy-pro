-- 造化仙府：补充项目数据编辑权限点。
-- 总监/老板沿用岗位编辑能力；其他岗位仍需在个人权限覆盖中单独勾选。
UPDATE "role_default_permission"
SET "points" = CASE
  WHEN "position" IN ('总监', '老板') THEN '["project_edit"]'::jsonb
  ELSE '[]'::jsonb
END,
    "updated_at" = NOW()
WHERE "module" = 'project_zhaohua';
