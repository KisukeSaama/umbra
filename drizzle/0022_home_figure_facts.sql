CREATE TABLE "library_arrival" (
	"rating_key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_request" ADD COLUMN "available_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "library_arrival_added_idx" ON "library_arrival" USING btree ("added_at","kind");--> statement-breakpoint
CREATE INDEX "media_request_available_idx" ON "media_request" USING btree ("available_at") WHERE available_at IS NOT NULL;--> statement-breakpoint
-- What the index still holds is all that is left of past arrivals.
INSERT INTO "library_arrival" ("rating_key", "kind", "added_at")
SELECT "rating_key", "kind", "added_at"
  FROM "library_item"
 WHERE "added_at" IS NOT NULL
   AND "kind" IN ('movie', 'show', 'episode')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- The arrival notice carries the moment a request was closed; the row's own
-- date is the fallback for a request that had nobody to tell.
UPDATE "media_request" AS r
   SET "available_at" = COALESCE(
         (SELECT min(n."created_at") FROM "notification" AS n
           WHERE n."dedup_key" = 'request_status:' || r."id"::text || ':available'),
         CASE WHEN r."status" = 'available' THEN r."updated_at" END)
 WHERE r."status" IN ('available', 'removed');
