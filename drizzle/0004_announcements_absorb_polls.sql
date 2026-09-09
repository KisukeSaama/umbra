ALTER TABLE "funding_goal" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "funding_transaction" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "funding_goal" CASCADE;--> statement-breakpoint
DROP TABLE "funding_transaction" CASCADE;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "link_label" text;--> statement-breakpoint
ALTER TABLE "poll" ADD COLUMN "announcement_id" uuid;--> statement-breakpoint
DO $$
DECLARE existing RECORD; note_id uuid;
BEGIN
  -- Every poll that predates the merge is given the note it should always have
  -- hung off: the question becomes the title, and the note is published when
  -- the poll was running.
  FOR existing IN SELECT "id", "question", "active", "created_at" FROM "poll" WHERE "announcement_id" IS NULL LOOP
    INSERT INTO "announcement" ("title", "content", "category", "published", "published_at", "created_at", "updated_at")
    VALUES (
      existing."question",
      existing."question",
      'information',
      existing."active",
      CASE WHEN existing."active" THEN existing."created_at" ELSE NULL END,
      existing."created_at",
      existing."created_at"
    )
    RETURNING "id" INTO note_id;
    UPDATE "poll" SET "announcement_id" = note_id WHERE "id" = existing."id";
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "poll" ALTER COLUMN "announcement_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "poll" ADD CONSTRAINT "poll_announcement_id_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "poll_announcement_idx" ON "poll" USING btree ("announcement_id");