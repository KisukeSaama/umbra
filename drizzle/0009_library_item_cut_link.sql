ALTER TABLE "library_item" ADD COLUMN "cut_provider_id" text;--> statement-breakpoint
ALTER TABLE "library_item" ADD COLUMN "cut_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "library_item_cut_idx" ON "library_item" USING btree ("cut_provider_id","kind");