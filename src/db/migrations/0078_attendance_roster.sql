-- 钉钉排班表逐日快照。保留“上班/休息/未配置”，避免用周末推测排休。
CREATE TABLE IF NOT EXISTS attendance_roster_days (
  source_node text NOT NULL,
  dingtalk_userid text NOT NULL,
  name text NOT NULL,
  dept_name text NOT NULL DEFAULT '',
  work_date text NOT NULL,
  status text NOT NULL CHECK (status IN ('rest', 'work', 'unset')),
  shift_name text NOT NULL DEFAULT '',
  sheet_id text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_node, dingtalk_userid, work_date)
);
CREATE INDEX IF NOT EXISTS attendance_roster_days_date ON attendance_roster_days(work_date);
CREATE INDEX IF NOT EXISTS attendance_roster_days_name_date ON attendance_roster_days(name, work_date);
CREATE TABLE IF NOT EXISTS attendance_roster_sync_log (
  id serial PRIMARY KEY,
  source_node text NOT NULL,
  month text NOT NULL,
  sheet_name text NOT NULL DEFAULT '',
  people integer NOT NULL DEFAULT 0,
  rest_days integer NOT NULL DEFAULT 0,
  success boolean NOT NULL,
  message text NOT NULL DEFAULT '',
  triggered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
