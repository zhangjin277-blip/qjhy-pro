CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_audit_user_time" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_action_time" ON "audit_log" USING btree ("action","created_at");