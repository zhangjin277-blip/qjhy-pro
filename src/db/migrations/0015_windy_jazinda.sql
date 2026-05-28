CREATE TABLE "anchor_score" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anchor_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_anchor_score_anchor_period" UNIQUE("anchor_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "anchor_score_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anchor_id" text NOT NULL,
	"change" integer NOT NULL,
	"reason" text NOT NULL,
	"stat_date" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_anchor_score_log_anchor_date_reason" UNIQUE("anchor_id","stat_date","reason")
);
--> statement-breakpoint
ALTER TABLE "anchor_score" ADD CONSTRAINT "anchor_score_anchor_id_anchor_profile_anchor_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."anchor_profile"("anchor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anchor_score_log" ADD CONSTRAINT "anchor_score_log_anchor_id_anchor_profile_anchor_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."anchor_profile"("anchor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anchor_score_period" ON "anchor_score" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "idx_anchor_score_log_anchor" ON "anchor_score_log" USING btree ("anchor_id");