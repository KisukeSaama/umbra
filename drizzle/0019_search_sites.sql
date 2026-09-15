CREATE TABLE "search_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"query_param" text NOT NULL,
	"query_template" text DEFAULT '{title} {year}' NOT NULL,
	"params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "search_site_name_idx" ON "search_site" USING btree ("name");--> statement-breakpoint
CREATE INDEX "search_site_order_idx" ON "search_site" USING btree ("position","name");