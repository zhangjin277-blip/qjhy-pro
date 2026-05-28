ALTER TABLE "product_config" ADD COLUMN "category" text NOT NULL DEFAULT '其他';

UPDATE "product_config" SET "category" = '捕鱼系' WHERE "product_name" IN ('捕鱼大作战', '电玩捕鱼', '途游休闲捕鱼');
UPDATE "product_config" SET "category" = '棋牌系' WHERE "product_name" IN ('途游斗地主', '富豪麻将');
UPDATE "product_config" SET "category" = 'SLG' WHERE "product_name" = '三国冰河时代';
