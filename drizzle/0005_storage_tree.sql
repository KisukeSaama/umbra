CREATE TABLE "storage_tree_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_bytes" bigint NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "storage_tree_snapshot_scanned_idx" ON "storage_tree_snapshot" USING btree ("scanned_at");