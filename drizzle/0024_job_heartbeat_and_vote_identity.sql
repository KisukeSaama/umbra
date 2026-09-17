-- A step says it is alive rather than being judged on how long it has been
-- going: a first walk of a large library is slow, not dead.
ALTER TABLE "job_run" ADD COLUMN "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- What the vote's foreign key below points at: an option belongs to one poll.
CREATE UNIQUE INDEX "poll_option_identity_idx" ON "poll_option" USING btree ("id","poll_id");--> statement-breakpoint
-- A vote naming an option of another question was counted in that question's
-- tally, so one person could weigh twice there. The route always refused it;
-- nothing in the database did. Any row that slipped through is not a vote.
DELETE FROM "vote" AS v
 WHERE NOT EXISTS (
   SELECT 1 FROM "poll_option" AS o
    WHERE o."id" = v."option_id" AND o."poll_id" = v."poll_id"
 );--> statement-breakpoint
ALTER TABLE "vote" DROP CONSTRAINT "vote_option_id_poll_option_id_fk";--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_option_poll_fk" FOREIGN KEY ("option_id","poll_id") REFERENCES "public"."poll_option"("id","poll_id") ON DELETE cascade ON UPDATE no action;
