CREATE TABLE IF NOT EXISTS "crawler_notification_setting" (
  "module_key" text PRIMARY KEY NOT NULL,
  "module_name" text NOT NULL,
  "description" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
