CREATE TABLE "entity_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"alias" text NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_entity_alias_entity" UNIQUE("entity_type","entity_id")
);
--> statement-breakpoint
CREATE INDEX "idx_entity_alias_type" ON "entity_alias" USING btree ("entity_type");