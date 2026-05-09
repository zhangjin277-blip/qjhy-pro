-- 投放累计原始值表：保留每次 excel 上传的"截止该小时累计值"（按 subaccount 维度）
-- 用于跨 batch 差分：用户每小时单独上传时，单 batch 内只 1 行没法做差，
-- 所以全部历史小时累计值都留在这张表里，每次 ingest 后重算 placement_row 该天该账户全部小时增量。
CREATE TABLE IF NOT EXISTS placement_cumulative_raw (
  date date NOT NULL,
  hour integer NOT NULL,
  dataset_id text NOT NULL,
  live_account_id text NOT NULL REFERENCES live_account(id),
  subaccount_name text NOT NULL,
  cost_yuan numeric(14, 3) NOT NULL DEFAULT 0,
  activations integer NOT NULL DEFAULT 0,
  payment_yuan numeric(14, 2) NOT NULL DEFAULT 0,
  start_download integer NOT NULL DEFAULT 0,
  finish_download integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL,
  import_batch_id uuid REFERENCES placement_import_batch(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (date, hour, dataset_id, live_account_id, subaccount_name)
);

CREATE INDEX IF NOT EXISTS idx_placement_cumulative_account_date
  ON placement_cumulative_raw (live_account_id, date, dataset_id);
