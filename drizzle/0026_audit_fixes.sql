ALTER TABLE "media_request" ADD COLUMN "track_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracked_series" ADD COLUMN "sync_attempted_at" timestamp with time zone;--> statement-breakpoint
-- Application code kept one poll open until now, but not under a race: close
-- all but the newest open one so the index below can be built.
UPDATE "poll" SET "active" = false
 WHERE "active"
   AND "id" <> (SELECT "id" FROM "poll" WHERE "active" ORDER BY "created_at" DESC, "id" DESC LIMIT 1);--> statement-breakpoint
CREATE UNIQUE INDEX "poll_single_active_idx" ON "poll" USING btree ("active") WHERE "poll"."active";