CREATE TABLE IF NOT EXISTS auth_super_admin (
  user_id text PRIMARY KEY REFERENCES dingtalk_user(user_id) ON DELETE CASCADE,
  reason text NOT NULL,
  granted_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
