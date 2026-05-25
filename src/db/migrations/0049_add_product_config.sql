CREATE TABLE "product_config" (
	"product_name" text PRIMARY KEY NOT NULL,
	"display_short" text NOT NULL,
	"accent_color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

