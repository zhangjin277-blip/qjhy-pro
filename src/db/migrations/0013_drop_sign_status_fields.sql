-- 删除 3 个无业务用途的签约状态/类型/离会列。
-- raw jsonb 保留完整 anchor_faction_info / signing_info，需要时可反查。
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "anchor_sign_type";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "anchor_sign_out";
ALTER TABLE "anchor_profile" DROP COLUMN IF EXISTS "leave_time";
