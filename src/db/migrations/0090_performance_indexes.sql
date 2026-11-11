-- 查询性能索引：只增加索引，不改变业务数据。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_anchor_profile_nick_name_trgm
  ON anchor_profile USING gin (lower(nick_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_anchor_profile_aweme_id_trgm
  ON anchor_profile USING gin (lower(aweme_display_id) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_dingtalk_user_dept_ids_gin
  ON dingtalk_user USING gin (dept_ids);

CREATE INDEX IF NOT EXISTS idx_anchor_daily_date_anchor
  ON anchor_daily (date, anchor_id);
CREATE INDEX IF NOT EXISTS idx_game_promo_date_anchor
  ON anchor_game_promo_daily (date, anchor_id);
CREATE INDEX IF NOT EXISTS idx_minigame_date_anchor
  ON anchor_minigame_daily (date, anchor_id);
CREATE INDEX IF NOT EXISTS idx_portrait_date_anchor
  ON anchor_portrait_daily (date, anchor_id);
