DROP INDEX "idx_broker_mapping_user";--> statement-breakpoint
ALTER TABLE "field_alias" ALTER COLUMN "hidden" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "field_alias" ALTER COLUMN "sort_order" SET DATA TYPE integer;