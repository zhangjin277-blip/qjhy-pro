-- 0045_delegated_user_ids.sql
-- 委托视图：邀请码 / 个人 override 加 delegated_user_ids，
-- 让外部用户（或内部跨部门员工）按"代某员工"的 self 视角看数据，
-- 而不依赖部门 scope=team。

ALTER TABLE "auth_invite_code"
  ADD COLUMN "delegated_user_ids" jsonb;

ALTER TABLE "auth_permission_override"
  ADD COLUMN "delegated_user_ids" jsonb;
