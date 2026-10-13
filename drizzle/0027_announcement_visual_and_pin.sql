-- Every existing note has no visual and no pin, so both checks hold on the
-- rows already there and nothing has to be backfilled.
ALTER TABLE "account" ADD COLUMN "news_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "image_alt" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "featured_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_single_featured_idx" ON "announcement" USING btree ("featured") WHERE "announcement"."featured";--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_featured_published_check" CHECK (NOT "announcement"."featured" OR "announcement"."published");--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_image_check" CHECK (("announcement"."image_key" IS NULL AND "announcement"."image_width" IS NULL AND "announcement"."image_height" IS NULL AND "announcement"."image_alt" IS NULL) OR ("announcement"."image_key" ~ '^[0-9a-f]{64}$' AND "announcement"."image_width" > 0 AND "announcement"."image_height" > 0 AND length(btrim("announcement"."image_alt")) > 0));
