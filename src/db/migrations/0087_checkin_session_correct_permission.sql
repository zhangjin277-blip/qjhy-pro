-- 将开播记录纠错权限从「直播账号」迁移到「开播记录」。
-- 0073 只迁移了板块数据范围，未迁移该操作点；本迁移保留现有授权语义。
BEGIN;

-- 岗位默认：沿用 live_account.session_correct 的授权，写入 checkin_history。
UPDATE role_default_permission AS dst
SET points = CASE
  WHEN EXISTS (
    SELECT 1
    FROM role_default_permission AS src
    WHERE src.position = dst.position
      AND src.module = 'live_account'
      AND src.points ? 'session_correct'
  ) THEN (
    SELECT CASE
      WHEN dst.points ? 'session_correct' THEN dst.points
      ELSE dst.points || '["session_correct"]'::jsonb
    END
  )
  ELSE dst.points
END,
updated_at = now()
WHERE dst.module = 'checkin_history';

-- 个人覆盖：已有开播记录覆盖时合并该点；没有时从直播账号覆盖复制一行。
UPDATE auth_permission_override AS dst
SET points = CASE
  WHEN dst.points IS NULL THEN NULL
  WHEN dst.points ? 'session_correct' THEN dst.points
  ELSE dst.points || '["session_correct"]'::jsonb
END
FROM auth_permission_override AS src
WHERE dst.user_id = src.user_id
  AND dst.module = 'checkin_history'
  AND src.module = 'live_account'
  AND src.points IS NOT NULL
  AND src.points ? 'session_correct';

INSERT INTO auth_permission_override
  (user_id, module, scope, points, reason, expires_at, delegated_user_ids, created_by, created_at)
SELECT
  src.user_id,
  'checkin_history',
  src.scope,
  '["session_correct"]'::jsonb,
  src.reason,
  src.expires_at,
  src.delegated_user_ids,
  src.created_by,
  src.created_at
FROM auth_permission_override AS src
WHERE src.module = 'live_account'
  AND src.points IS NOT NULL
  AND src.points ? 'session_correct'
  AND NOT EXISTS (
    SELECT 1 FROM auth_permission_override AS dst
    WHERE dst.user_id = src.user_id AND dst.module = 'checkin_history'
  );

-- 旧板块移除该点，避免权限配置出现两处来源。
UPDATE role_default_permission
SET points = points - 'session_correct', updated_at = now()
WHERE module = 'live_account' AND points ? 'session_correct';

UPDATE auth_permission_override
SET points = points - 'session_correct'
WHERE module = 'live_account' AND points IS NOT NULL AND points ? 'session_correct';

COMMIT;
