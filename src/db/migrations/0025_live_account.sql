-- 直播账号（核心维度表，跨平台）
-- 一个账号 = 一个平台直播间账号，有平台 UID、绑定手机、设备编号、所在物理直播间
-- 来源：运营手维护 + PRO3 迁移导入

CREATE TABLE IF NOT EXISTS "live_account" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "account_name"            TEXT NOT NULL,
  "platform"                TEXT NOT NULL,
  "platform_account_id"     TEXT,
  "platform_uid"            TEXT,
  "platform_real_name"      TEXT,
  "phone"                   TEXT,
  "phone_index"             TEXT,
  "phone_real_name"         TEXT,
  "room_id"                 TEXT REFERENCES "live_room"("id"),
  "game_account_1"          TEXT,
  "game_account_2"          TEXT,
  "game_account_3"          TEXT,
  "product"                 TEXT NOT NULL,
  "agent_dingtalk_user_id"  TEXT REFERENCES "dingtalk_user"("user_id"),
  "placement_label"         TEXT UNIQUE,
  "live_status"             TEXT NOT NULL DEFAULT 'unknown',
  "raw"                     JSONB NOT NULL DEFAULT '{}',
  "created_at"              TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "uq_live_account_platform_uid" ON "live_account"("platform", "platform_uid");
CREATE INDEX "idx_live_account_platform" ON "live_account"("platform");
CREATE INDEX "idx_live_account_product" ON "live_account"("product");
CREATE INDEX "idx_live_account_agent" ON "live_account"("agent_dingtalk_user_id");
CREATE INDEX "idx_live_account_room" ON "live_account"("room_id");
CREATE INDEX "idx_live_account_platform_account_id" ON "live_account"("platform_account_id");
