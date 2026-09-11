-- A request whose title reached the server and was deleted from it since is
-- retired as `removed`, which frees the title for a new request the way a
-- refusal does. See docs/adr/0017-a-title-can-leave-the-server.md.
ALTER TABLE "media_request" DROP CONSTRAINT "media_request_status_check";--> statement-breakpoint
DROP INDEX "media_request_active_idx";--> statement-breakpoint
CREATE INDEX "media_request_media_idx" ON "media_request" USING btree ("media_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_request_active_idx" ON "media_request" USING btree ("media_id") WHERE status NOT IN ('rejected', 'removed');--> statement-breakpoint
ALTER TABLE "media_request" ADD CONSTRAINT "media_request_status_check" CHECK ("media_request"."status" IN ('requested', 'accepted', 'available', 'rejected', 'removed'));