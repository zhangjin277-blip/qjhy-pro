-- 0054: 权限点细分（spec 2026-07-06-permission-points-redesign）
-- 三布尔(can_edit/can_export/can_admin) → points jsonb；按「现状行为等价」翻译回填。
-- 手动应用：本地 + NAS 各跑一次（psql）。跑前 pg_dump 备份。

BEGIN;

-- 1) 加列
ALTER TABLE role_default_permission ADD COLUMN IF NOT EXISTS points jsonb NOT NULL DEFAULT '[]';
ALTER TABLE auth_permission_override ADD COLUMN IF NOT EXISTS points jsonb;

-- 2) 翻译函数：按板块 × (edit, export, admin) → 点集合（spec §6 规则）
CREATE OR REPLACE FUNCTION _translate_points(p_module text, p_edit boolean, p_export boolean, p_admin boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE pts text[] := '{}';
BEGIN
  IF p_module = 'dashboard' THEN
    IF p_export THEN pts := pts || '{export}'; END IF;
  ELSIF p_module = 'anchors' THEN
    IF p_export THEN pts := pts || '{export}'; END IF;
  ELSIF p_module = 'crawler' THEN
    IF p_edit THEN pts := pts || '{run_jobs,cookie_update,field_alias}'; END IF;
  ELSIF p_module = 'permissions' THEN
    IF p_admin THEN pts := pts || '{manage_roles,manage_overrides,manage_dept_leaders,invite_codes}'; END IF;
  ELSIF p_module = 'live_account' THEN
    IF p_edit THEN pts := pts || '{account_edit,delete_request,schedule_edit,room_edit,room_delete,floorplan_edit}'; END IF;
    IF p_admin THEN pts := pts || '{delete_review,session_correct}'; END IF;
  ELSIF p_module = 'live_anchor' THEN
    IF p_edit THEN pts := pts || '{anchor_edit,anchor_delete,binding_edit}'; END IF;
  ELSIF p_module = 'placement' THEN
    IF p_edit THEN pts := pts || '{upload}'; END IF;
  ELSIF p_module = 'editing_workflow' THEN
    IF p_edit THEN pts := pts || '{task_create,source_upload,task_claim,task_assign,edited_upload,review,publish,task_manage,cover_manage,material_upload,material_organize,material_delete}'; END IF;
    IF p_admin THEN pts := pts || '{task_delete}'; END IF;
  ELSIF p_module = 'software_library' THEN
    IF p_edit THEN pts := pts || '{item_edit,item_delete}'; END IF;
  ELSIF p_module = 'recording' THEN
    IF p_edit THEN pts := pts || '{task_manage,file_delete}'; END IF;
  END IF;
  -- live_room: 无自有权限点（操作判 live_account）
  RETURN to_jsonb(pts);
END $$;

-- 3) 回填岗位默认
UPDATE role_default_permission
SET points = _translate_points(module, can_edit, can_export, can_admin);

-- 4) 回填个人覆盖：仅当该行任一布尔非 null 时生成整体替换集合。
--    组合语义 = 以岗位翻译结果为底（此处无法逐用户联岗位——采用保守等价：
--    对「布尔非 null」的行，用 COALESCE(override 值, 对应岗位行为) 无法静态还原，
--    故直接按 override 三布尔的显式值翻译（null 视为 false）。
--    影响评估：现网 override 行均为「显式加权」用途（历来只用于升权），
--    null 字段本就依赖岗位默认，翻译后岗位默认 points 已带上等价点，
--    合并语义(override 整体替换)会丢失岗位底——为避免此问题，
--    这里将 override.points 计算为：翻译(显式布尔) ∪ 该用户岗位默认的翻译结果。
UPDATE auth_permission_override o
SET points = (
  SELECT to_jsonb(ARRAY(
    SELECT DISTINCT e FROM (
      SELECT jsonb_array_elements_text(
        _translate_points(o.module, COALESCE(o.can_edit,false), COALESCE(o.can_export,false), COALESCE(o.can_admin,false))
      ) AS e
      UNION
      SELECT jsonb_array_elements_text(
        _translate_points(o.module,
          COALESCE(rd.can_edit,false), COALESCE(rd.can_export,false), COALESCE(rd.can_admin,false))
      ) AS e
      FROM (
        SELECT r.can_edit, r.can_export, r.can_admin
        FROM role_default_permission r
        WHERE r.module = o.module
          AND r.position = COALESCE(
            (SELECT po.position FROM user_position_override po WHERE po.user_id = o.user_id),
            (SELECT du.title FROM dingtalk_user du WHERE du.user_id = o.user_id),
            '其他')
        UNION ALL
        SELECT r2.can_edit, r2.can_export, r2.can_admin
        FROM role_default_permission r2
        WHERE r2.module = o.module AND r2.position = '其他'
          AND NOT EXISTS (
            SELECT 1 FROM role_default_permission r3
            WHERE r3.module = o.module
              AND r3.position = COALESCE(
                (SELECT po.position FROM user_position_override po WHERE po.user_id = o.user_id),
                (SELECT du.title FROM dingtalk_user du WHERE du.user_id = o.user_id),
                '其他'))
        LIMIT 1
      ) rd
    ) merged
  ))
)
WHERE o.can_edit IS NOT NULL OR o.can_export IS NOT NULL OR o.can_admin IS NOT NULL;
-- 三布尔全 null 的 override 行（只改 scope / 只挂委托）→ points 保持 NULL（不覆盖岗位）

-- 5) 删旧列 + 清理函数
ALTER TABLE role_default_permission DROP COLUMN can_edit, DROP COLUMN can_export, DROP COLUMN can_admin;
ALTER TABLE auth_permission_override DROP COLUMN can_edit, DROP COLUMN can_export, DROP COLUMN can_admin;
DROP FUNCTION _translate_points(text, boolean, boolean, boolean);

COMMIT;
