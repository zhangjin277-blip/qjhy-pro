-- 招募经纪人快照（用于按项目维度回溯历史归属，因为招募经纪人会变）
ALTER TABLE "anchor_daily" ADD COLUMN IF NOT EXISTS "recruit_broker_snapshot" TEXT;
