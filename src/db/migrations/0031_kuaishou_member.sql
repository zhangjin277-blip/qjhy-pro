CREATE TABLE "kuaishou_member" (
	"user_id" text PRIMARY KEY NOT NULL,
	"member_name" text NOT NULL,
	"avatar" text,
	"fans_count" integer,
	"broker_name_raw" text,
	"agent_dingtalk_user_id" text,
	"inferred_product" text,
	"content_category" text,
	"joined_at" date,
	"contract_expire_at" date,
	"renewal_status" text,
	"contract_renew_type" integer,
	"last_live_time" timestamp,
	"last_photo_time" timestamp,
	"living_url" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kuaishou_member" ADD CONSTRAINT "kuaishou_member_agent_dingtalk_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("agent_dingtalk_user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_member_broker" ON "kuaishou_member" ("broker_name_raw");
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_member_agent" ON "kuaishou_member" ("agent_dingtalk_user_id");
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_member_product" ON "kuaishou_member" ("inferred_product");
--> statement-breakpoint
CREATE INDEX "idx_kuaishou_member_last_live" ON "kuaishou_member" ("last_live_time");
