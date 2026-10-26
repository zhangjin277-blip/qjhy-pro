-- Attendance defaults: employees SELF, department leaders TEAM via dept_leader.
-- The existing emergency super administrator bypasses regular permissions.
BEGIN;
DO $$
DECLARE previous jsonb; current_state jsonb;
BEGIN
  SELECT jsonb_build_object(
    'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY position) FROM role_default_permission r WHERE module='attendance'),
    'overrides', (SELECT jsonb_agg(to_jsonb(o) ORDER BY user_id) FROM auth_permission_override o WHERE module='attendance')
  ) INTO previous;
  INSERT INTO role_default_permission (position,module,scope,points,description)
  SELECT position,'attendance','self','["approval"]'::jsonb,'全员查看本人考勤，部门负责人查看负责部门，超级管理员完整管理'
  FROM (
    SELECT position FROM role_default_permission
    UNION SELECT COALESCE(NULLIF(title,''),'其他') FROM dingtalk_user
    UNION SELECT position FROM user_position_override
    UNION SELECT '其他'
  ) positions
  ON CONFLICT (position,module) DO UPDATE SET
    scope=excluded.scope, points=excluded.points, description=excluded.description, updated_at=now()
  WHERE role_default_permission.scope IS DISTINCT FROM excluded.scope
     OR role_default_permission.points IS DISTINCT FROM excluded.points
     OR role_default_permission.description IS DISTINCT FROM excluded.description;
  -- Preserve explicitly assigned operation points; reset obsolete viewing scopes/delegation.
  UPDATE auth_permission_override o SET scope=CASE WHEN EXISTS (
    SELECT 1 FROM dept_leader l WHERE l.user_id=o.user_id
  ) THEN 'team' ELSE 'self' END, delegated_user_ids=NULL
  WHERE module='attendance' AND (
    scope IS DISTINCT FROM CASE WHEN EXISTS (SELECT 1 FROM dept_leader l WHERE l.user_id=o.user_id) THEN 'team' ELSE 'self' END
    OR delegated_user_ids IS NOT NULL
  );
  SELECT jsonb_build_object(
    'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY position) FROM role_default_permission r WHERE module='attendance'),
    'overrides', (SELECT jsonb_agg(to_jsonb(o) ORDER BY user_id) FROM auth_permission_override o WHERE module='attendance')
  ) INTO current_state;
  IF previous IS DISTINCT FROM current_state THEN
    INSERT INTO audit_log(action,target_type,target_id,"before","after") VALUES (
      'ATTENDANCE_PERMISSION_DEFAULTS_RESET','module','attendance',previous,
      current_state || jsonb_build_object('reason','按用户要求重设考勤：全员本人、负责人本部门、超级管理员全部权限')
    );
  END IF;
END $$;
COMMIT;
