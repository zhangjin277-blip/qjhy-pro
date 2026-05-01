CREATE TABLE "dingtalk_dept" (
	"dept_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dingtalk_user" (
	"user_id" text PRIMARY KEY NOT NULL,
	"unionid" text NOT NULL,
	"name" text NOT NULL,
	"mobile" text,
	"title" text,
	"dept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dingtalk_user_unionid_unique" UNIQUE("unionid")
);
--> statement-breakpoint
CREATE INDEX "idx_dingtalk_dept_parent" ON "dingtalk_dept" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_dingtalk_user_unionid" ON "dingtalk_user" USING btree ("unionid");--> statement-breakpoint
CREATE INDEX "idx_dingtalk_user_active" ON "dingtalk_user" USING btree ("active");