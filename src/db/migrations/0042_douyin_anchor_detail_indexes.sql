-- Speed up the anchor detail "valid video count" query.
CREATE INDEX IF NOT EXISTS idx_dy_video_anchor_publish_item_snapshot
  ON douyin_video_snapshot (anchor_id, publish_time, item_id, snapshot_date DESC);
