-- 产品分类配置表
-- 用于看板色带 + 简称显示
-- PK = product_name，与 live_account.product 外键关联

CREATE TABLE IF NOT EXISTS "product_config" (
	"product_name" text PRIMARY KEY NOT NULL,
	"display_short" text NOT NULL,
	"accent_color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
