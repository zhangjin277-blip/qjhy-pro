-- 线下直播间（物理工位）
-- 跨平台共用：B17 既可以播抖音也可以播快手
-- 来源：运营手维护 + PRO3 迁移自动建

CREATE TABLE IF NOT EXISTS "live_room" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "room_no"    TEXT NOT NULL UNIQUE,
  "location"   TEXT,
  "status"     TEXT NOT NULL DEFAULT 'active',
  "raw"        JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_live_room_status" ON "live_room"("status");
