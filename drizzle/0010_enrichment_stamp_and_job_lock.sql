-- A stamp for the enrichment pass, three indexes, and the row that becomes a
-- lock. Any run left "running" by an interrupted process is closed first: the
-- unique index below would refuse to be created over two of them, and a
-- migration runs at boot, when no cycle of ours is under way.
UPDATE "job_run"
   SET status = 'failure', finished_at = now(), error = 'interrupted'
 WHERE status = 'running';--> statement-breakpoint
ALTER TABLE "library_item" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_single_running_idx" ON "job_run" USING btree ("job_name") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "library_item_section_synced_idx" ON "library_item" USING btree ("section_key","synced_at");--> statement-breakpoint
CREATE INDEX "media_request_requester_idx" ON "media_request" USING btree ("requested_by","created_at");
