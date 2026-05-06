-- 给员工手动分配项目岗位（独立于钉钉 title）。
-- 钉钉每天同步会覆盖 dingtalk_user 整行，所以分配关系放独立表。
-- 优先级：user_position_override.position > dingtalk_user.title > "其他"

CREATE TABLE IF NOT EXISTS "user_position_override" (
  "user_id"     TEXT NOT NULL PRIMARY KEY REFERENCES "dingtalk_user"("user_id") ON DELETE CASCADE,
  "position"    TEXT NOT NULL,
  "reason"      TEXT,
  "assigned_by" TEXT,
  "assigned_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
