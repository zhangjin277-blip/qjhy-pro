-- 项目中心权限：沿用工作台的岗位可见范围，外部邀请码可单独勾选造化仙府。
INSERT INTO "role_default_permission" ("position", "module", "scope", "points", "description")
SELECT "position", 'project_zhaohua', "scope", '[]'::jsonb, '造化仙府项目访问'
FROM "role_default_permission"
WHERE "module" = 'dashboard'
ON CONFLICT ("position", "module") DO UPDATE
SET "scope" = EXCLUDED."scope",
    "points" = EXCLUDED."points",
    "description" = EXCLUDED."description",
    "updated_at" = NOW();
