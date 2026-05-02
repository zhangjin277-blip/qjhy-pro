-- portrait_daily: rename + add fields to align PRO3 ANCHOR_STATS (9 portrait fields)
ALTER TABLE "anchor_portrait_daily" RENAME COLUMN "enter_uv" TO "watch_uv";
ALTER TABLE "anchor_portrait_daily" RENAME COLUMN "enter_ratio" TO "enter_room_rate";
ALTER TABLE "anchor_portrait_daily" RENAME COLUMN "pay_ucnt" TO "consume_uv";
ALTER TABLE "anchor_portrait_daily" RENAME COLUMN "pay_ratio" TO "consume_rate";

ALTER TABLE "anchor_portrait_daily" ADD COLUMN "show_cnt" integer;
ALTER TABLE "anchor_portrait_daily" ADD COLUMN "watch_cnt" integer;
ALTER TABLE "anchor_portrait_daily" ADD COLUMN "avg_watch_duration" numeric(10,2);
ALTER TABLE "anchor_portrait_daily" ADD COLUMN "consume_cnt" integer;

-- 调整精度（之前 5,4 不够大；进房率/付费转化率需要更高精度）
ALTER TABLE "anchor_portrait_daily" ALTER COLUMN "enter_room_rate" TYPE numeric(7,6);
ALTER TABLE "anchor_portrait_daily" ALTER COLUMN "consume_rate" TYPE numeric(7,6);
