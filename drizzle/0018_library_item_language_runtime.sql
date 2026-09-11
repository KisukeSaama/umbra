ALTER TABLE "library_item" ADD COLUMN "original_language" text;--> statement-breakpoint
ALTER TABLE "library_item" ADD COLUMN "runtime" integer;--> statement-breakpoint
-- Every title already looked at is looked at again, so the new columns fill in
-- over the next runs instead of waiting out the thirty-day retry.
UPDATE "library_item" SET "enriched_at" = NULL WHERE "kind" IN ('movie', 'show');