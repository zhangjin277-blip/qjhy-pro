-- 软件库（Software Library）：software_category + software_item
-- 手写 migration（drizzle journal 已长期不同步，本项目 0010+ 均手动 psql 应用）。
-- 应用方式：docker exec -i qjhy-postgres psql -U qjhy -d qjhy < src/db/migrations/0054_software_library.sql
CREATE TABLE IF NOT EXISTS "software_category" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "software_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category_id" bigint REFERENCES "public"."software_category"("id"),
	"name" text NOT NULL,
	"version" text,
	"note" text,
	"nas_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_size" bigint NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"uploaded_by_user_id" text REFERENCES "public"."dingtalk_user"("user_id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_software_item_category" ON "software_item" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_software_item_hash" ON "software_item" USING btree ("file_hash");
