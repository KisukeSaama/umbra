-- A note can set one page inside itself: an https address, the title a screen
-- reader announces for the frame, and a shape from a closed set. See
-- docs/adr/0018-a-note-can-embed-a-page.md.
ALTER TABLE "announcement" ADD COLUMN "embed_url" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "embed_title" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "embed_ratio" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_embed_ratio_check" CHECK ("announcement"."embed_ratio" IS NULL OR "announcement"."embed_ratio" IN ('wide', 'square', 'tall'));