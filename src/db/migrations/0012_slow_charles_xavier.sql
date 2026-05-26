ALTER TABLE "editing_task" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "editing_task" ADD COLUMN "urgent_reason" text;