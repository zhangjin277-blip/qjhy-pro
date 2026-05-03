-- 删除 8 个无业务用途的 anchor_profile 列。
-- raw jsonb 里仍保留完整 anchor_base_info，需要时可从 raw 反查。
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "gender";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "xigua_display_id";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "real_name";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "live_status";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "anchor_health_score_level";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "anchor_ban_30d";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "anchor_violation_30d";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "notes";
