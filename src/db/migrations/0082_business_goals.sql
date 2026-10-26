CREATE TABLE IF NOT EXISTS business_goal (
 id text PRIMARY KEY, period text NOT NULL, project text NOT NULL, line text NOT NULL,
 dept_id text, owner_ids jsonb NOT NULL DEFAULT '[]', owner_labels jsonb NOT NULL DEFAULT '[]',
 metric text NOT NULL, unit text NOT NULL, kind text NOT NULL CHECK (kind IN ('sum','count','ratio')),
 target double precision CHECK (target >= 0 AND target < 'Infinity'::float8),
 actual double precision CHECK (actual >= 0 AND actual < 'Infinity'::float8),
 as_of date, evidence text NOT NULL DEFAULT '', definition text NOT NULL DEFAULT '',
 confirmed boolean NOT NULL DEFAULT false, parent_id text REFERENCES business_goal(id),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
 version integer NOT NULL DEFAULT 1, created_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (actual IS NULL OR (as_of IS NOT NULL AND confirmed)), CHECK (id IS DISTINCT FROM parent_id)
);
CREATE INDEX IF NOT EXISTS idx_business_goal_period ON business_goal(period);
CREATE INDEX IF NOT EXISTS idx_business_goal_parent ON business_goal(parent_id);
CREATE TABLE IF NOT EXISTS business_goal_revision (
 id text PRIMARY KEY, goal_id text NOT NULL REFERENCES business_goal(id), action text NOT NULL,
 before jsonb, after jsonb NOT NULL, reason text NOT NULL, actor_id text NOT NULL,
 actor_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_goal_revision ON business_goal_revision(goal_id,created_at);
-- Explicit opt-in: registering this module does not change existing user grants.
INSERT INTO role_default_permission(position,module,scope,points,description)
SELECT DISTINCT position,'goals','none','[]'::jsonb,'目标管理默认关闭，请单独授权'
FROM role_default_permission ON CONFLICT(position,module) DO NOTHING;
