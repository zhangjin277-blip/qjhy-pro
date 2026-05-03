-- 小游戏金额字段从 bigint 改 numeric(12,2)。
-- 平台返回 after_divided_author_income / after_divided_trade_union_income 带 2 位小数（如 14.77 元），
-- 之前被 Math.round 强制取整丢失精度。
ALTER TABLE "anchor_minigame_daily"
  ALTER COLUMN "before_divided_income" TYPE numeric(12, 2) USING "before_divided_income"::numeric(12, 2);
ALTER TABLE "anchor_minigame_daily"
  ALTER COLUMN "after_divided_author_income" TYPE numeric(12, 2) USING "after_divided_author_income"::numeric(12, 2);
ALTER TABLE "anchor_minigame_daily"
  ALTER COLUMN "after_divided_trade_union_income" TYPE numeric(12, 2) USING "after_divided_trade_union_income"::numeric(12, 2);
