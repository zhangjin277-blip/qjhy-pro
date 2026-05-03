-- 删除 5 个无业务用途的音浪明细列。
-- raw jsonb 保留完整 CSV 内容，需要时可反查。
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "activity_fan_ticket_no_guest";
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "special_fan_ticket";
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "link_screen_fan_ticket";
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "link_screen_room_fan_ticket";
ALTER TABLE "anchor_daily" DROP COLUMN IF EXISTS "total_ticket_outside_link";
