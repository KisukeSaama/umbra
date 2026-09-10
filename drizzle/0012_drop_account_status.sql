-- A pending account was never let in, so nobody loses anything here. Left in
-- place it would count as a member once the status is gone; whoever of them has
-- the server gets a fresh account at their next sign-in.
DELETE FROM "account" WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_status_check";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "status";
