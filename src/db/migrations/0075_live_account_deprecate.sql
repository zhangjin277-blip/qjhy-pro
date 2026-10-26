-- 直播账号「删除」改为「废弃归档」（2026-10-08）
-- 背景：2026-07-14 删号连带硬删剪辑任务事故后，删除仍会物理删除任务 / 开播记录 / 排班。
-- 现在去掉删除功能：账号只能标记废弃（列表折叠归档，可恢复），历史数据全部保留。可重跑。

-- 1. 废弃标记
ALTER TABLE "live_account" ADD COLUMN IF NOT EXISTS "deprecated_at" timestamp with time zone;
ALTER TABLE "live_account" ADD COLUMN IF NOT EXISTS "deprecated_by_user_id" text;
CREATE INDEX IF NOT EXISTS "idx_live_account_deprecated_at" ON "live_account" ("deprecated_at");

-- 2. 数据库层兜底：所有 ON DELETE CASCADE 指向 live_account 的外键改为 RESTRICT
--    （约束名在各环境可能不同，按定义动态查找；改完后物理删有历史的账号会被拒绝）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.confrelid = 'public.live_account'::regclass
      AND c.contype = 'f'
      AND c.confdeltype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      r.tbl,
      r.conname,
      replace(r.def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT')
    );
  END LOOP;
END $$;

-- 3. 删除审核流下线：未处理的申请统一置为已取消（表保留作历史记录）
UPDATE "live_account_delete_request"
SET "status" = 'cancelled',
    "reviewed_at" = now(),
    "review_note" = '删除功能已下线（改为废弃归档），申请自动取消'
WHERE "status" = 'pending';
