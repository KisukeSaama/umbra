-- Taken up is being fetched: requests and asks no longer have a separate step
-- for it. What sat in that step moves back to the one that now means it, and the
-- notifications announcing the step go, since the member was already told at
-- the step before.
UPDATE "media_request" SET "status" = 'accepted' WHERE "status" = 'processing';--> statement-breakpoint
UPDATE "report" SET "status" = 'acknowledged' WHERE "status" = 'in_progress' AND "reason" IN ('missing_season', 'missing_episode', 'series_outdated');--> statement-breakpoint
DELETE FROM "notification" WHERE "kind" = 'request_status' AND "payload"->>'status' = 'processing';--> statement-breakpoint
DELETE FROM "notification" WHERE "kind" = 'report_status' AND "payload"->>'status' = 'in_progress' AND "payload"->>'reason' IN ('missing_season', 'missing_episode', 'series_outdated');--> statement-breakpoint
ALTER TABLE "media_request" DROP CONSTRAINT "media_request_status_check";--> statement-breakpoint
ALTER TABLE "media_request" ADD CONSTRAINT "media_request_status_check" CHECK ("media_request"."status" IN ('requested', 'accepted', 'available', 'rejected'));
