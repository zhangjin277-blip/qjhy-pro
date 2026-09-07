ALTER TABLE live_anchor
  ADD COLUMN IF NOT EXISTS anchor_type text NOT NULL DEFAULT '生态主播';

CREATE INDEX IF NOT EXISTS idx_live_anchor_type ON live_anchor(anchor_type);
