-- src/db/migrations/0029_phase_2_2_placements.sql
-- Phase 2.2 — 投放数据 + 排班 override + 上传批次审计

-- 1. placement_import_batch（先建，因 placement_row 引用）
CREATE TABLE placement_import_batch (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,                    -- 'excel-upload' | 'pro3-migration'
  file_name       TEXT,
  file_size_bytes INTEGER,
  dataset_id      TEXT NOT NULL,
  date_range_from DATE,
  date_range_to   DATE,
  row_count       INTEGER NOT NULL DEFAULT 0,
  rows_inserted   INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  rows_skipped    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,                    -- 'parsing' | 'completed' | 'failed' | 'partial'
  error_log       JSONB,
  uploaded_by     TEXT REFERENCES auth_user(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX placement_import_batch_uploaded_at_idx ON placement_import_batch (uploaded_at DESC);

-- 2. placement_row
-- Note: live_account_id is TEXT (not UUID) matching live_account.id primary key type
CREATE TABLE placement_row (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  hour            INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  dataset_id      TEXT NOT NULL,
  live_account_id TEXT NOT NULL REFERENCES live_account(id),

  cost_yuan       NUMERIC(14,3) NOT NULL DEFAULT 0,
  activations     INTEGER NOT NULL DEFAULT 0,
  payment_yuan    NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_download  INTEGER NOT NULL DEFAULT 0,
  finish_download INTEGER NOT NULL DEFAULT 0,

  attributed_dingtalk_user_id TEXT REFERENCES dingtalk_user(user_id),
  attribution_dirty           BOOLEAN NOT NULL DEFAULT TRUE,
  attribution_computed_at     TIMESTAMPTZ,
  attribution_source          TEXT,                 -- 'override' | 'default' | 'conflict' | 'unmatched' | NULL

  raw             JSONB NOT NULL,
  import_batch_id UUID REFERENCES placement_import_batch(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (date, hour, dataset_id, live_account_id)
);

CREATE INDEX placement_row_account_date_idx     ON placement_row (live_account_id, date);
CREATE INDEX placement_row_anchor_date_idx      ON placement_row (attributed_dingtalk_user_id, date);
CREATE INDEX placement_row_dataset_date_idx     ON placement_row (dataset_id, date);
CREATE INDEX placement_row_dirty_partial_idx    ON placement_row (id) WHERE attribution_dirty = TRUE;

-- 3. schedule_override
-- Note: account_id is TEXT (not UUID) matching live_account.id primary key type
CREATE TABLE schedule_override (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        TEXT NOT NULL REFERENCES live_account(id),
  date              DATE NOT NULL,
  dingtalk_user_id  TEXT NOT NULL REFERENCES dingtalk_user(user_id),
  time_slots        JSONB NOT NULL,
  reason            TEXT,
  created_by        TEXT REFERENCES auth_user(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, date, dingtalk_user_id)
);

CREATE INDEX schedule_override_account_date_idx ON schedule_override (account_id, date);
