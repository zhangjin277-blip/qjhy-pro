CREATE TABLE "material_asset" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"folder_id" bigint,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"nas_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_size" bigint NOT NULL,
	"format" text,
	"duration_sec" integer,
	"width" integer,
	"height" integer,
	"cover_path" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "material_folder" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN IF NOT EXISTS "source_duration_sec" integer;--> statement-breakpoint
ALTER TABLE "product_config" ADD COLUMN IF NOT EXISTS "category" text DEFAULT '其他' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_column_preset" ADD COLUMN IF NOT EXISTS "broker_filter" jsonb;--> statement-breakpoint
ALTER TABLE "material_asset" ADD CONSTRAINT "material_asset_folder_id_material_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."material_folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_asset" ADD CONSTRAINT "material_asset_uploaded_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_folder" ADD CONSTRAINT "material_folder_created_by_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_material_asset_folder" ON "material_asset" USING btree ("folder_id","type");--> statement-breakpoint
CREATE INDEX "idx_material_asset_type" ON "material_asset" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_material_asset_hash" ON "material_asset" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "idx_material_folder_parent" ON "material_folder" USING btree ("parent_id");