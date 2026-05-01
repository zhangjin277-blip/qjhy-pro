CREATE TABLE "auth_permission_override" (
	"user_id" text PRIMARY KEY NOT NULL,
	"scope" text,
	"can_edit" boolean,
	"can_export" boolean,
	"can_admin" boolean,
	"reason" text NOT NULL,
	"expires_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dept_leader" (
	"id" serial PRIMARY KEY NOT NULL,
	"dept_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_dept_leader_dept_user" UNIQUE("dept_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "role_default_permission" (
	"position" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_export" boolean DEFAULT false NOT NULL,
	"can_admin" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_permission_override" ADD CONSTRAINT "auth_permission_override_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dept_leader" ADD CONSTRAINT "dept_leader_dept_id_dingtalk_dept_dept_id_fk" FOREIGN KEY ("dept_id") REFERENCES "public"."dingtalk_dept"("dept_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dept_leader" ADD CONSTRAINT "dept_leader_user_id_dingtalk_user_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dingtalk_user"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dept_leader_user" ON "dept_leader" USING btree ("user_id");